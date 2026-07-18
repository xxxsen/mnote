import { useCallback, useRef, useState, useTransition } from "react";
import type { EditorView } from "@codemirror/view";
import { redo, undo } from "@codemirror/commands";
import { applyMarkdownCommand, type MarkdownCommand } from "../commands/markdown-commands";
import { extractTitleFromContent } from "../utils";

function countWords(text: string): number {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const Segmenter = Intl.Segmenter;
    const segmenter = new Segmenter(undefined, { granularity: "word" });
    let count = 0;
    for (const segment of segmenter.segment(text)) {
      if (segment.isWordLike) count += 1;
    }
    return count;
  }
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function applyLegacyWrap(view: EditorView, prefix: string, suffix: string) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const before = view.state.sliceDoc(Math.max(0, from - prefix.length), from);
  const after = view.state.sliceDoc(to, Math.min(view.state.doc.length, to + suffix.length));
  if (from >= prefix.length && before === prefix && after === suffix) {
    const changes = view.state.changes([
      { from: from - prefix.length, to: from, insert: "" },
      { from: to, to: to + suffix.length, insert: "" },
    ]);
    view.dispatch({ changes, selection: { anchor: changes.mapPos(from, -1), head: changes.mapPos(to, -1) } });
    return;
  }
  view.dispatch({
    changes: { from, to, insert: prefix + selected + suffix },
    selection: { anchor: from + prefix.length, head: to + prefix.length },
  });
}

const LEGACY_COMMANDS: Record<string, MarkdownCommand> = {
  "line:# ": { kind: "heading", level: 1 },
  "line:## ": { kind: "heading", level: 2 },
  "line:### ": { kind: "heading", level: 3 },
  "line:- ": { kind: "block", block: "bullet" },
  "line:1. ": { kind: "block", block: "ordered" },
  "line:- [ ] ": { kind: "block", block: "task" },
  "line:> ": { kind: "block", block: "quote" },
  "wrap:**": { kind: "inline", mark: "bold" },
  "wrap:*": { kind: "inline", mark: "italic" },
  "wrap:_": { kind: "inline", mark: "italic" },
  "wrap:~~": { kind: "inline", mark: "strike" },
  "wrap:<u>": { kind: "inline", mark: "underline" },
  "wrap:`": { kind: "inline", mark: "code" },
  "wrap:```\n": { kind: "insert", item: "codeBlock" },
  "wrap:[": { kind: "insert", item: "link" },
};

function commandFromLegacy(type: "wrap" | "line", prefix: string): MarkdownCommand | null {
  return LEGACY_COMMANDS[type + ":" + prefix] ?? null;
}

export function useEditorBuffer(opts: {
  editorViewRef: React.RefObject<EditorView | null>;
  contentRef: React.RefObject<string>;
  lastSavedContentRef: React.RefObject<string>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { editorViewRef, contentRef, lastSavedContentRef, onDirtyChange } = opts;

  const [content, setContent] = useState("");
  const [previewContent, setPreviewContent] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChangesState] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [previewPending, setPreviewPending] = useState(false);

  const [, startTransition] = useTransition();
  const previewUpdateTimerRef = useRef<number | null>(null);
  const previewPendingTimerRef = useRef<number | null>(null);
  const dirtyRef = useRef(false);

  const setHasUnsavedChanges = useCallback((next: boolean) => {
    dirtyRef.current = next;
    setHasUnsavedChangesState(next);
    onDirtyChange?.(next);
  }, [onDirtyChange]);

  const updateCursorInfo = useCallback((view: EditorView) => {
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    startTransition(() => {
      setCursorPos({ line: line.number, col: pos - line.from + 1 });
    });
  }, [startTransition]);

  const schedulePreviewUpdate = useCallback(() => {
    if (previewUpdateTimerRef.current !== null) {
      window.clearTimeout(previewUpdateTimerRef.current);
    }
    if (previewPendingTimerRef.current !== null) {
      window.clearTimeout(previewPendingTimerRef.current);
    }
    setPreviewPending(false);
    const delay = contentRef.current.length > 50_000 ? 500 : 200;
    previewPendingTimerRef.current = window.setTimeout(() => setPreviewPending(true), 250);
    previewUpdateTimerRef.current = window.setTimeout(() => {
      const text = contentRef.current;
      if (previewPendingTimerRef.current !== null) {
        window.clearTimeout(previewPendingTimerRef.current);
        previewPendingTimerRef.current = null;
      }
      startTransition(() => {
        setPreviewContent(text);
        setCharCount(text.length);
        setWordCount(countWords(text));
        setPreviewPending(false);
      });
    }, delay);
  }, [contentRef, startTransition]);

  const publishContent = useCallback((nextContent: string, immediatePreview = false) => {
    contentRef.current = nextContent;
    setContent(nextContent);
    const dirty = nextContent !== lastSavedContentRef.current;
    dirtyRef.current = dirty;
    setHasUnsavedChangesState(dirty);
    onDirtyChange?.(dirty);
    setDraftTitle(extractTitleFromContent(nextContent));
    if (immediatePreview) {
      setPreviewContent(nextContent);
      setCharCount(nextContent.length);
      setWordCount(countWords(nextContent));
    }
    schedulePreviewUpdate();
  }, [contentRef, lastSavedContentRef, onDirtyChange, schedulePreviewUpdate]);

  const insertTextAtCursor = useCallback((text: string) => {
    const view = editorViewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
    });
    publishContent(view.state.doc.toString(), true);
    view.focus();
  }, [editorViewRef, publishContent]);

  const applyContent = useCallback((nextContent: string) => {
    const view = editorViewRef.current;
    if (view) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: nextContent },
        selection: { anchor: nextContent.length },
      });
      view.focus();
    }
    publishContent(nextContent, true);
  }, [editorViewRef, publishContent]);

  const executeCommand = useCallback((command: MarkdownCommand) => {
    const view = editorViewRef.current;
    if (!view) return;
    view.dispatch(applyMarkdownCommand(view.state, command));
    publishContent(view.state.doc.toString(), true);
    view.focus();
  }, [editorViewRef, publishContent]);

  const handleFormat = useCallback((
    type: "wrap" | "line",
    prefix: string,
    suffix = "",
  ) => {
    const command = commandFromLegacy(type, prefix);
    if (command) { executeCommand(command); return; }
    const view = editorViewRef.current;
    if (!view || type !== "wrap") return;
    applyLegacyWrap(view, prefix, suffix);
    publishContent(view.state.doc.toString(), true);
    view.focus();
  }, [editorViewRef, executeCommand, publishContent]);

  const replacePlaceholder = useCallback((placeholder: string, replacement: string) => {
    const view = editorViewRef.current;
    if (!view) {
      if (!contentRef.current.includes(placeholder)) return;
      publishContent(contentRef.current.replace(placeholder, replacement), true);
      return;
    }
    const index = view.state.doc.toString().indexOf(placeholder);
    if (index === -1) return;
    view.dispatch({
      changes: { from: index, to: index + placeholder.length, insert: replacement },
    });
    publishContent(view.state.doc.toString(), true);
  }, [contentRef, editorViewRef, publishContent]);

  const handleUndo = useCallback(() => {
    const view = editorViewRef.current;
    if (view && undo(view)) publishContent(view.state.doc.toString(), true);
    view?.focus();
  }, [editorViewRef, publishContent]);
  const handleRedo = useCallback(() => {
    const view = editorViewRef.current;
    if (view && redo(view)) publishContent(view.state.doc.toString(), true);
    view?.focus();
  }, [editorViewRef, publishContent]);
  const handleInsertTable = useCallback(() => {
    executeCommand({ kind: "insert", item: "table" });
  }, [executeCommand]);

  return {
    content,
    setContent,
    previewContent,
    setPreviewContent,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    dirtyRef,
    draftTitle,
    wordCount,
    setWordCount,
    charCount,
    setCharCount,
    cursorPos,
    previewPending,
    previewUpdateTimerRef,
    startTransition,
    updateCursorInfo,
    schedulePreviewUpdate,
    publishContent,
    insertTextAtCursor,
    applyContent,
    executeCommand,
    handleFormat,
    replacePlaceholder,
    handleUndo,
    handleRedo,
    handleInsertTable,
  };
}
