import { useState, useCallback, useRef, useTransition } from "react";
import type { EditorView } from "@codemirror/view";
import { undo, redo } from "@codemirror/commands";

function applyLineFormat(view: EditorView, prefix: string) {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;
  const startLine = doc.lineAt(from);
  const endLine = doc.lineAt(to);
  let allHavePrefix = true;
  for (let i = startLine.number; i <= endLine.number; i++) {
    if (!doc.line(i).text.startsWith(prefix)) { allHavePrefix = false; break; }
  }
  const changes: { from: number; to: number; insert: string }[] = [];
  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = doc.line(i);
    if (allHavePrefix) {
      changes.push({ from: line.from, to: line.from + prefix.length, insert: "" });
    } else if (!line.text.startsWith(prefix)) {
      changes.push({ from: line.from, to: line.from, insert: prefix });
    }
  }
  let singleCursorAnchor: number | null = null;
  if (from === to && startLine.number === endLine.number) {
    singleCursorAnchor = computeLineFormatCursor(startLine, from, prefix, allHavePrefix);
  }
  view.dispatch(singleCursorAnchor === null ? { changes } : { changes, selection: { anchor: singleCursorAnchor } });
}

function computeLineFormatCursor(line: { from: number; text: string }, from: number, prefix: string, allHavePrefix: boolean): number {
  if (allHavePrefix && line.text.startsWith(prefix)) {
    return from - Math.min(prefix.length, Math.max(0, from - line.from));
  }
  if (!allHavePrefix && !line.text.startsWith(prefix)) return from + prefix.length;
  return from;
}

function applyWrapFormat(view: EditorView, prefix: string, suffix: string) {
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;
  const extendedFrom = from - prefix.length;
  const extendedTo = to + suffix.length;
  const rangeText = doc.sliceString(Math.max(0, extendedFrom), Math.min(doc.length, extendedTo));
  const isWrapped = rangeText.startsWith(prefix) && rangeText.endsWith(suffix) && extendedFrom >= 0;
  if (isWrapped) {
    view.dispatch({
      changes: { from: extendedFrom, to: extendedTo, insert: doc.sliceString(from, to) },
      selection: { anchor: extendedFrom, head: extendedFrom + (to - from) },
    });
  } else {
    const text = doc.sliceString(from, to);
    view.dispatch({
      changes: { from, to, insert: prefix + text + suffix },
      selection: { anchor: from + prefix.length, head: from + prefix.length + text.length },
    });
  }
}

export function useEditorContent(opts: {
  editorViewRef: React.RefObject<EditorView | null>;
  contentRef: React.RefObject<string>;
  lastSavedContentRef: React.RefObject<string>;
}) {
  const { editorViewRef, contentRef, lastSavedContentRef } = opts;

  const [content, setContent] = useState("");
  const [previewContent, setPreviewContent] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  const [, startTransition] = useTransition();
  const previewUpdateTimerRef = useRef<number | null>(null);

  const updateCursorInfo = useCallback((view: EditorView) => {
    const state = view.state;
    const pos = state.selection.main.head;
    const line = state.doc.lineAt(pos);
    startTransition(() => {
      setCursorPos({ line: line.number, col: pos - line.from + 1 });
    });
  }, [startTransition]);

  const schedulePreviewUpdate = useCallback(() => {
    if (previewUpdateTimerRef.current) {
      window.clearTimeout(previewUpdateTimerRef.current);
    }
    previewUpdateTimerRef.current = window.setTimeout(() => {
      const text = contentRef.current || "";
      const charCnt = text.length;
      const words = text.trim().split(/\s+/).filter(w => w.length > 0);
      const wordCnt = words.length;
      const changed = contentRef.current !== lastSavedContentRef.current;

      startTransition(() => {
        setPreviewContent(contentRef.current);
        setCharCount(charCnt);
        setWordCount(wordCnt);
        setHasUnsavedChanges(changed);
      });
    }, 300);
  }, [startTransition, contentRef, lastSavedContentRef]);

  const insertTextAtCursor = useCallback(
    (text: string) => {
      const view = editorViewRef.current;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
      });
      contentRef.current = view.state.doc.toString();
      setContent(contentRef.current);
      setPreviewContent(contentRef.current);
      setHasUnsavedChanges(contentRef.current !== lastSavedContentRef.current);
      schedulePreviewUpdate();
      view.focus();
    },
    [editorViewRef, contentRef, lastSavedContentRef, schedulePreviewUpdate]
  );

  const applyContent = useCallback(
    (nextContent: string) => {
      const view = editorViewRef.current;
      if (view) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: nextContent },
          selection: { anchor: nextContent.length },
        });
        view.focus();
      }
      contentRef.current = nextContent;
      setContent(nextContent);
      setPreviewContent(nextContent);
      setHasUnsavedChanges(nextContent !== lastSavedContentRef.current);
      schedulePreviewUpdate();
    },
    [editorViewRef, contentRef, lastSavedContentRef, schedulePreviewUpdate]
  );

  const handleFormat = useCallback(
    (type: "wrap" | "line", prefix: string, suffix = "") => {
      const view = editorViewRef.current;
      if (!view) return;
      if (type === "line") {
        applyLineFormat(view, prefix);
      } else {
        applyWrapFormat(view, prefix, suffix);
      }
      contentRef.current = view.state.doc.toString();
      setContent(contentRef.current);
      setPreviewContent(contentRef.current);
      setHasUnsavedChanges(contentRef.current !== lastSavedContentRef.current);
      schedulePreviewUpdate();
      view.focus();
    },
    [editorViewRef, contentRef, lastSavedContentRef, schedulePreviewUpdate]
  );

  const replacePlaceholder = useCallback(
    (placeholder: string, replacement: string) => {
      const view = editorViewRef.current;
      if (!view) {
        if (!contentRef.current.includes(placeholder)) return;
        contentRef.current = contentRef.current.replace(placeholder, replacement);
        schedulePreviewUpdate();
        return;
      }
      const contentText = view.state.doc.toString();
      const index = contentText.indexOf(placeholder);
      if (index === -1) return;
      view.dispatch({
        changes: { from: index, to: index + placeholder.length, insert: replacement },
      });
      contentRef.current = view.state.doc.toString();
      setContent(contentRef.current);
      setPreviewContent(contentRef.current);
      setHasUnsavedChanges(contentRef.current !== lastSavedContentRef.current);
      schedulePreviewUpdate();
    },
    [editorViewRef, contentRef, lastSavedContentRef, schedulePreviewUpdate]
  );

  const handleUndo = useCallback(() => { const view = editorViewRef.current; if (view) { undo(view); view.focus(); } }, [editorViewRef]);
  const handleRedo = useCallback(() => { const view = editorViewRef.current; if (view) { redo(view); view.focus(); } }, [editorViewRef]);
  const handleInsertTable = useCallback(() => { insertTextAtCursor("\n| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n"); }, [insertTextAtCursor]);

  return {
    content, setContent, previewContent, setPreviewContent,
    hasUnsavedChanges, setHasUnsavedChanges, wordCount, setWordCount, charCount, setCharCount,
    cursorPos, previewUpdateTimerRef, startTransition, updateCursorInfo, schedulePreviewUpdate,
    insertTextAtCursor, applyContent, handleFormat, replacePlaceholder, handleUndo, handleRedo, handleInsertTable,
  };
}
