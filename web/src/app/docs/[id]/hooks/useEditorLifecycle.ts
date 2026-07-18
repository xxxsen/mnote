"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { Document, Tag } from "@/types";
import {
  classifyStoredDraft,
  type StoredEditorDraft,
} from "../services/draft-storage";

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
  onRecoveryRequired?: (payload: {
    draft: StoredEditorDraft;
    detail: DocumentDetail;
  }) => void;
  onLoadError: (err: unknown) => void;
  requestSave: (snapshot: { title: string; content: string }) => void;
  managePersistence?: boolean;
};

export function useEditorLifecycle({
  id,
  hasUnsavedChanges,
  contentRef,
  lastSavedContentRef,
  documentActions,
  extractTitleFromContent,
  onLoadingChange,
  onLoaded,
  onRecoveryRequired,
  onLoadError,
  requestSave,
  managePersistence = true,
}: UseEditorLifecycleOptions) {
  const onLoadingChangeRef = useRef(onLoadingChange);
  const onLoadedRef = useRef(onLoaded);
  const onRecoveryRequiredRef = useRef(onRecoveryRequired);
  const onLoadErrorRef = useRef(onLoadError);
  const requestSaveRef = useRef(requestSave);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onLoadedRef.current = onLoaded;
    onRecoveryRequiredRef.current = onRecoveryRequired;
    onLoadErrorRef.current = onLoadError;
    requestSaveRef.current = requestSave;
  }, [onLoadError, onLoaded, onLoadingChange, onRecoveryRequired, requestSave]);

  const fetchDoc = useCallback(async () => {
    onLoadingChangeRef.current(true);
    try {
      const detail = await documentActions.getDocument();
      const serverContent = detail.document.content;
      lastSavedContentRef.current = serverContent;
      const classification = typeof window === "undefined"
        ? { kind: "use_server" as const }
        : classifyStoredDraft(window.localStorage, {
          docId: id,
          content: serverContent,
          contentRevision: detail.document.content_revision || 1,
          contentHash: detail.document.content_hash || "",
        });

      if (classification.kind === "needs_recovery" && onRecoveryRequiredRef.current) {
        contentRef.current = serverContent;
        onRecoveryRequiredRef.current({ draft: classification.draft, detail });
        return;
      }
      const initialContent = classification.kind === "auto_recover"
        ? classification.draft.content
        : classification.kind === "needs_recovery"
          ? classification.draft.content
          : serverContent;
      const hasDraftOverride = initialContent !== serverContent;
      contentRef.current = initialContent;
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
    if (derivedTitle) requestSaveRef.current({ title: derivedTitle, content: latestContent });
  }, [contentRef, extractTitleFromContent, lastSavedContentRef]);

  useEffect(() => {
    if (id) void fetchDoc();
  }, [fetchDoc, id]);

  useEffect(() => {
    if (!managePersistence) return;
    const interval = window.setInterval(handleAutoSave, 10000);
    return () => window.clearInterval(interval);
  }, [handleAutoSave, managePersistence]);

  useEffect(() => {
    if (!managePersistence || typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      if (!hasUnsavedChanges) {
        window.localStorage.removeItem(`mnote:draft:${id}`);
        return;
      }
      window.localStorage.setItem(
        `mnote:draft:${id}`,
        JSON.stringify({ content: contentRef.current, updatedAt: Date.now() }),
      );
    }, 400);
    return () => window.clearTimeout(timer);
  }, [contentRef, hasUnsavedChanges, id, managePersistence]);

  useEffect(() => {
    if (!managePersistence) return;
    return () => {
      if (typeof window !== "undefined" && hasUnsavedChanges) {
        window.localStorage.setItem(
          `mnote:draft:${id}`,
          JSON.stringify({ content: contentRef.current, updatedAt: Date.now() }),
        );
      }
    };
  }, [contentRef, hasUnsavedChanges, id, managePersistence]);
}
