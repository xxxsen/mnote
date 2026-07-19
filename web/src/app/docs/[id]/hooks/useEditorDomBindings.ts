"use client";

import { useCallback, useEffect } from "react";
import type { EditorView } from "@codemirror/view";

type Props = {
  onSave: () => void;
  editorViewRef: React.RefObject<EditorView | null>;
  setEditorView: (view: EditorView) => void;
  pasteHandlerRef: React.RefObject<((event: ClipboardEvent) => void) | null>;
  setPasteHandler: (handler: (event: ClipboardEvent) => void) => void;
  keydownHandlerRef: React.RefObject<((event: KeyboardEvent) => void) | null>;
  setKeydownHandler: (handler: (event: KeyboardEvent) => void) => void;
  handleEditorScroll: () => void;
  handlePaste: (event: ClipboardEvent) => Promise<void>;
  slashKeydownRef: React.RefObject<(event: KeyboardEvent) => boolean>;
  wikilinkKeydownRef: React.RefObject<(event: KeyboardEvent) => boolean>;
  previewTimerRef: React.RefObject<number | null>;
  scrollFrameRef: React.RefObject<number | null>;
};

export function useEditorDomBindings({
  onSave,
  editorViewRef,
  setEditorView,
  pasteHandlerRef,
  setPasteHandler,
  keydownHandlerRef,
  setKeydownHandler,
  handleEditorScroll,
  handlePaste,
  slashKeydownRef,
  wikilinkKeydownRef,
  previewTimerRef,
  scrollFrameRef,
}: Props) {
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        onSave();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [onSave]);

  useEffect(() => () => {
    const view = editorViewRef.current;
    if (view && pasteHandlerRef.current) {
      view.dom.removeEventListener("paste", pasteHandlerRef.current, true);
    }
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
    if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
  }, [editorViewRef, pasteHandlerRef, previewTimerRef, scrollFrameRef]);

  return useCallback((view: EditorView) => {
    setEditorView(view);
    view.scrollDOM.addEventListener("scroll", handleEditorScroll);
    if (pasteHandlerRef.current) {
      view.dom.removeEventListener("paste", pasteHandlerRef.current, true);
    }
    const paste = (event: ClipboardEvent) => { void handlePaste(event); };
    setPasteHandler(paste);
    view.dom.addEventListener("paste", paste, true);
    if (keydownHandlerRef.current) {
      view.dom.removeEventListener("keydown", keydownHandlerRef.current, true);
    }
    const keydown = (event: KeyboardEvent) => {
      if (slashKeydownRef.current(event) || wikilinkKeydownRef.current(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    setKeydownHandler(keydown);
    view.dom.addEventListener("keydown", keydown, true);
  }, [
    handleEditorScroll,
    handlePaste,
    keydownHandlerRef,
    pasteHandlerRef,
    setEditorView,
    setKeydownHandler,
    setPasteHandler,
    slashKeydownRef,
    wikilinkKeydownRef,
  ]);
}
