"use client";

import { useCallback, useEffect, useRef, type MutableRefObject } from "react";
import type { Document } from "@/types";

type DocumentActions = {
  getDocument: () => Promise<{
    document: Document;
    tag_ids: string[];
    tags?: import("@/types").Tag[];
  }>;
  saveDocument: (title: string, content: string) => Promise<void>;
};

type UseEditorLifecycleOptions = {
  id: string;
  saving: boolean;
  hasUnsavedChanges: boolean;
  contentRef: MutableRefObject<string>;
  lastSavedContentRef: MutableRefObject<string>;
  documentActions: DocumentActions;
  extractTitleFromContent: (value: string) => string;
  onLoadingChange: (loading: boolean) => void;
  onLoaded: (payload: {
    initialContent: string;
    detail: { document: Document; tag_ids: string[]; tags?: import("@/types").Tag[] };
    hasDraftOverride: boolean;
  }) => void;
  onLoadError: (err: unknown) => void;
  onAutoSaved: (payload: { title: string; timestamp: number }) => void;
};

export function useEditorLifecycle({
  id,
  saving,
  hasUnsavedChanges,
  contentRef,
  lastSavedContentRef,
  documentActions,
  extractTitleFromContent,
  onLoadingChange,
  onLoaded,
  onLoadError,
  onAutoSaved,
}: UseEditorLifecycleOptions) {
  const onLoadingChangeRef = useRef(onLoadingChange);
  const onLoadedRef = useRef(onLoaded);
  const onLoadErrorRef = useRef(onLoadError);
  const onAutoSavedRef = useRef(onAutoSaved);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onLoadedRef.current = onLoaded;
    onLoadErrorRef.current = onLoadError;
    onAutoSavedRef.current = onAutoSaved;
  }, [onAutoSaved, onLoadError, onLoaded, onLoadingChange]);

  const fetchDoc = useCallback(async () => {
    onLoadingChangeRef.current(true);
    try {
      const detail = await documentActions.getDocument();
      let initialContent = detail.document.content;
      let hasDraftOverride = false;

      if (typeof window !== "undefined") {
        const draft = window.localStorage.getItem(`mnote:draft:${id}`);
        if (draft) {
          try {
            const parsed = JSON.parse(draft) as { content?: string };
            if (parsed.content && parsed.content !== detail.document.content) {
              initialContent = parsed.content;
              hasDraftOverride = true;
            }
          } catch {
            window.localStorage.removeItem(`mnote:draft:${id}`);
          }
        }
      }

      contentRef.current = initialContent;
      lastSavedContentRef.current = detail.document.content;
      onLoadedRef.current({ initialContent, detail, hasDraftOverride });
    } catch (err) {
      onLoadErrorRef.current(err);
    } finally {
      onLoadingChangeRef.current(false);
    }
  }, [contentRef, documentActions, id, lastSavedContentRef]);

  const handleAutoSave = useCallback(async () => {
    const latestContent = contentRef.current;
    if (latestContent === lastSavedContentRef.current || saving) return;

    const derivedTitle = extractTitleFromContent(latestContent);
    if (!derivedTitle) return;

    try {
      await documentActions.saveDocument(derivedTitle, latestContent);
      lastSavedContentRef.current = latestContent;
      const timestamp = Math.floor(Date.now() / 1000);
      onAutoSavedRef.current({ title: derivedTitle, timestamp });
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(`mnote:draft:${id}`);
      }
    } catch {
      return;
    }
  }, [contentRef, documentActions, extractTitleFromContent, id, lastSavedContentRef, saving]);

  useEffect(() => {
    if (!id) return;
    void fetchDoc();
  }, [fetchDoc, id]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void handleAutoSave();
    }, 10000);
    return () => window.clearInterval(interval);
  }, [handleAutoSave]);

  useEffect(() => {
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
      if (typeof window !== "undefined" && hasUnsavedChanges) {
        const payload = JSON.stringify({ content: contentRef.current, updatedAt: Date.now() });
        window.localStorage.setItem(`mnote:draft:${id}`, payload);
      }
    };
  }, [contentRef, hasUnsavedChanges, id]);
}
