"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { Document, Tag } from "@/types";

type DocumentDetail = {
  document: Document;
  tag_ids: string[];
  tags?: Tag[];
};

type DocumentActions = {
  getDocument: () => Promise<DocumentDetail>;
};

type UseEditorLifecycleOptions = {
  id: string;
  hasUnsavedChanges: boolean;
  contentRef: RefObject<string>;
  lastSavedContentRef: RefObject<string>;
  documentActions: DocumentActions;
  extractTitleFromContent: (value: string) => string;
  onLoadingChange: (loading: boolean) => void;
  onLoaded: (payload: {
    initialContent: string;
    detail: DocumentDetail;
    hasDraftOverride: boolean;
  }) => void;
  onLoadError: (err: unknown) => void;
  // requestSave is invoked by the auto-save tick. The hook does not own the
  // save protocol any more (see FE-1 / useEditorSaveQueue); it only schedules
  // requests and lets the queue coordinate single-flight execution.
  requestSave: (snapshot: { title: string; content: string }) => void;
};

function loadDraft(id: string, serverContent: string): { initialContent: string; hasDraftOverride: boolean } {
  /* v8 ignore next -- SSR guard untestable in jsdom */
  if (typeof window === "undefined") return { initialContent: serverContent, hasDraftOverride: false };
  const draft = window.localStorage.getItem(`mnote:draft:${id}`);
  if (!draft) return { initialContent: serverContent, hasDraftOverride: false };
  try {
    const parsed = JSON.parse(draft) as { content?: string };
    if (parsed.content && parsed.content !== serverContent) {
      return { initialContent: parsed.content, hasDraftOverride: true };
    }
  } catch {
    window.localStorage.removeItem(`mnote:draft:${id}`);
  }
  return { initialContent: serverContent, hasDraftOverride: false };
}

export function useEditorLifecycle({
  id,
  hasUnsavedChanges,
  contentRef,
  lastSavedContentRef,
  documentActions,
  extractTitleFromContent,
  onLoadingChange,
  onLoaded,
  onLoadError,
  requestSave,
}: UseEditorLifecycleOptions) {
  const onLoadingChangeRef = useRef(onLoadingChange);
  const onLoadedRef = useRef(onLoaded);
  const onLoadErrorRef = useRef(onLoadError);
  const requestSaveRef = useRef(requestSave);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onLoadedRef.current = onLoaded;
    onLoadErrorRef.current = onLoadError;
    requestSaveRef.current = requestSave;
  }, [onLoadError, onLoaded, onLoadingChange, requestSave]);

  const fetchDoc = useCallback(async () => {
    onLoadingChangeRef.current(true);
    try {
      const detail = await documentActions.getDocument();
      const { initialContent, hasDraftOverride } = loadDraft(id, detail.document.content);

      contentRef.current = initialContent;
      lastSavedContentRef.current = detail.document.content;
      onLoadedRef.current({ initialContent, detail, hasDraftOverride });
    } catch (err) {
      onLoadErrorRef.current(err);
    } finally {
      onLoadingChangeRef.current(false);
    }
  }, [contentRef, documentActions, id, lastSavedContentRef]);

  const handleAutoSave = useCallback(() => {
    const latestContent = contentRef.current;
    if (latestContent === lastSavedContentRef.current) return;

    const derivedTitle = extractTitleFromContent(latestContent);
    if (!derivedTitle) return;

    // Hand the snapshot to the queue; the queue takes care of skipping when
    // a save is already in flight and of preserving the local draft on
    // failure (we deliberately do not touch localStorage here any more).
    requestSaveRef.current({ title: derivedTitle, content: latestContent });
  }, [contentRef, extractTitleFromContent, lastSavedContentRef]);

  useEffect(() => {
    if (!id) return;
    void fetchDoc();
  }, [fetchDoc, id]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      handleAutoSave();
    }, 10000);
    return () => window.clearInterval(interval);
  }, [handleAutoSave]);

  useEffect(() => {
    /* v8 ignore next -- SSR guard untestable in jsdom */
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      if (!hasUnsavedChanges) {
        window.localStorage.removeItem(`mnote:draft:${id}`);
        return;
      }
      const payload = JSON.stringify({ content: contentRef.current, updatedAt: Date.now() });
      window.localStorage.setItem(`mnote:draft:${id}`, payload);
    }, 400);

    return () => window.clearTimeout(timer);
  }, [contentRef, hasUnsavedChanges, id]);

  useEffect(() => {
    return () => {
      /* v8 ignore next -- SSR guard untestable in jsdom */
      if (typeof window !== "undefined" && hasUnsavedChanges) {
        const payload = JSON.stringify({ content: contentRef.current, updatedAt: Date.now() });
        window.localStorage.setItem(`mnote:draft:${id}`, payload);
      }
    };
  }, [contentRef, hasUnsavedChanges, id]);
}
