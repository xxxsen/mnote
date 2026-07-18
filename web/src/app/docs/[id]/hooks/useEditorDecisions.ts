"use client";

import { useCallback, useState } from "react";
import type { DocDetail } from "../types";
import type { StoredEditorDraft } from "../services/draft-storage";

export type DraftRecoveryState = {
  draft: StoredEditorDraft;
  detail: DocDetail;
};

export function useEditorDecisionState(documentActions: {
  getDocument: () => Promise<DocDetail>;
}) {
  const [draftRecovery, setDraftRecovery] = useState<DraftRecoveryState | null>(null);
  const [conflictServer, setConflictServer] = useState<DocDetail | null>(null);
  const [conflictLoading, setConflictLoading] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);

  const loadConflict = useCallback(async () => {
    setConflictLoading(true);
    setConflictError(null);
    try {
      setConflictServer(await documentActions.getDocument());
    } catch (error: unknown) {
      setConflictError(error instanceof Error ? error.message : "Failed to load server version");
    } finally {
      setConflictLoading(false);
    }
  }, [documentActions]);

  const clearConflict = useCallback(() => {
    setConflictServer(null);
    setConflictError(null);
  }, []);

  return {
    draftRecovery,
    setDraftRecovery,
    conflictServer,
    conflictLoading,
    conflictError,
    loadConflict,
    clearConflict,
  };
}

type DecisionActionsOptions = {
  draftRecovery: DraftRecoveryState | null;
  setDraftRecovery: (state: DraftRecoveryState | null) => void;
  conflictServer: DocDetail | null;
  clearConflict: () => void;
  initializeLoaded: (content: string, detail: DocDetail, draftOverride: boolean) => void;
  removeLocalDraft: () => boolean;
  contentRef: React.RefObject<string>;
  setLastSavedContent: (content: string) => void;
  applyContent: (content: string) => void;
  setDirty: (dirty: boolean) => void;
  markLocalChanges: () => void;
  requestSave: (snapshot: { title: string; content: string }) => void;
  resyncRevision: (next: {
    revision: number;
    hash?: string;
    title?: string;
    content?: string;
    mtime?: number | null;
  }) => void;
  extractTitle: (content: string) => string;
  notify: (message: string) => void;
};

function serverSyncPayload(detail: DocDetail, extractTitle: (content: string) => string) {
  const document = detail.document;
  return {
    revision: document.content_revision || 1,
    hash: document.content_hash || "",
    title: extractTitle(document.content),
    content: document.content,
    mtime: document.content_mtime || document.mtime || null,
  };
}

export function useEditorDecisionActions(opts: DecisionActionsOptions) {
  const useRecoveredServer = useCallback(() => {
    if (!opts.draftRecovery) return;
    const detail = opts.draftRecovery.detail;
    opts.removeLocalDraft();
    opts.setDraftRecovery(null);
    opts.initializeLoaded(detail.document.content, detail, false);
  }, [opts]);

  const useRecoveredLocal = useCallback(() => {
    if (!opts.draftRecovery) return;
    const { draft, detail } = opts.draftRecovery;
    opts.setDraftRecovery(null);
    opts.initializeLoaded(draft.content, detail, true);
  }, [opts]);

  const useConflictServer = useCallback(() => {
    if (!opts.conflictServer) return;
    const document = opts.conflictServer.document;
    opts.setLastSavedContent(document.content);
    opts.resyncRevision(serverSyncPayload(opts.conflictServer, opts.extractTitle));
    opts.applyContent(document.content);
    opts.setDirty(false);
    opts.removeLocalDraft();
    opts.clearConflict();
  }, [opts]);

  const keepConflictDraft = useCallback(() => {
    if (!opts.conflictServer) return;
    const localContent = opts.contentRef.current;
    const localTitle = opts.extractTitle(localContent);
    if (!localTitle) {
      opts.notify("Add a title before syncing this draft.");
      return;
    }
    opts.setLastSavedContent(opts.conflictServer.document.content);
    opts.resyncRevision(serverSyncPayload(opts.conflictServer, opts.extractTitle));
    opts.setDirty(true);
    opts.markLocalChanges();
    opts.clearConflict();
    opts.requestSave({ title: localTitle, content: localContent });
  }, [opts]);

  return {
    useRecoveredServer,
    useRecoveredLocal,
    useConflictServer,
    keepConflictDraft,
  };
}
