import { useState, useCallback, useEffect, useRef } from "react";
import type { EditorView } from "@codemirror/view";
import { apiFetch } from "@/lib/api";

export function useWikilinkMenu(opts: {
  editorViewRef: React.RefObject<EditorView | null>;
  contentRef: React.RefObject<string>;
  lastSavedContentRef: React.RefObject<string>;
  schedulePreviewUpdate: () => void;
  setContent: (val: string) => void;
  setPreviewContent: (val: string) => void;
  setHasUnsavedChanges: (val: boolean) => void;
}) {
  const {
    editorViewRef, contentRef, lastSavedContentRef,
    schedulePreviewUpdate, setContent, setPreviewContent, setHasUnsavedChanges,
  } = opts;

  const [wikilinkMenu, setWikilinkMenu] = useState<{ open: boolean; x: number; y: number; query: string; from: number }>({
    open: false, x: 0, y: 0, query: "", from: 0,
  });
  const [wikilinkResults, setWikilinkResults] = useState<{ id: string; title: string }[]>([]);
  const [wikilinkLoading, setWikilinkLoading] = useState(false);
  const [wikilinkIndex, setWikilinkIndex] = useState(0);
  const wikilinkTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!wikilinkMenu.open) {
      setWikilinkResults([]); // eslint-disable-line react-hooks/set-state-in-effect -- cleanup on menu close
      return;
    }
    if (wikilinkTimerRef.current) window.clearTimeout(wikilinkTimerRef.current);
    wikilinkTimerRef.current = window.setTimeout(() => {
      setWikilinkLoading(true);
      const params = new URLSearchParams();
      if (wikilinkMenu.query) params.set("q", wikilinkMenu.query);
      params.set("limit", "8");
      apiFetch<{ id: string; title: string }[]>(`/documents?${params.toString()}`)
        .then((docs) => { setWikilinkResults(docs); })
        .catch(() => { setWikilinkResults([]); })
        .finally(() => { setWikilinkLoading(false); });
    }, 200);
    return () => { if (wikilinkTimerRef.current) window.clearTimeout(wikilinkTimerRef.current); };
  }, [wikilinkMenu.open, wikilinkMenu.query]);

  useEffect(() => {
    setWikilinkIndex(0); // eslint-disable-line react-hooks/set-state-in-effect -- reset index when results change
  }, [wikilinkResults]);

  const handleWikilinkSelect = useCallback((docTitle: string, docId: string) => {
    const view = editorViewRef.current;
    if (!view) return;
    const cursorPos = view.state.selection.main.head;
    const from = wikilinkMenu.from;
    const docString = view.state.doc.toString();
    const hasSuffix = docString.slice(cursorPos, cursorPos + 2) === "]]";
    const insertText = `[${docTitle}](/docs/${docId})`;
    view.dispatch({
      changes: { from, to: hasSuffix ? cursorPos + 2 : cursorPos, insert: insertText },
      selection: { anchor: from + insertText.length },
    });
    contentRef.current = view.state.doc.toString();
    setContent(contentRef.current);
    setPreviewContent(contentRef.current);
    setHasUnsavedChanges(contentRef.current !== lastSavedContentRef.current);
    schedulePreviewUpdate();
    setWikilinkMenu(prev => ({ ...prev, open: false }));
    view.focus();
  }, [editorViewRef, wikilinkMenu.from, contentRef, lastSavedContentRef, schedulePreviewUpdate, setContent, setPreviewContent, setHasUnsavedChanges]);

  const handleWikilinkKeyDown = useCallback((e: React.KeyboardEvent | KeyboardEvent) => {
    if (!wikilinkMenu.open || wikilinkResults.length === 0) return false;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setWikilinkIndex(prev => (prev < wikilinkResults.length - 1 ? prev + 1 : prev));
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setWikilinkIndex(prev => (prev > 0 ? prev - 1 : prev));
      return true;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const selected = wikilinkResults[wikilinkIndex];
      handleWikilinkSelect(selected.title, selected.id);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setWikilinkMenu(prev => ({ ...prev, open: false }));
      return true;
    }
    return false;
  }, [wikilinkMenu.open, wikilinkResults, wikilinkIndex, handleWikilinkSelect]);

  const wikilinkKeydownRef = useRef(handleWikilinkKeyDown);
  useEffect(() => {
    wikilinkKeydownRef.current = handleWikilinkKeyDown;
  }, [handleWikilinkKeyDown]);

  return {
    wikilinkMenu, setWikilinkMenu,
    wikilinkResults,
    wikilinkLoading,
    wikilinkIndex,
    handleWikilinkSelect,
    handleWikilinkKeyDown,
    wikilinkKeydownRef,
  };
}
