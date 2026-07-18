"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorSyncStatus } from "../types";
import {
  createDraftV2,
  flushDraft,
  removeDraft,
} from "../services/draft-storage";
import { useAutosaveScheduler } from "./useAutosaveScheduler";

type Snapshot = { title: string; content: string };

export type UseEditorPersistenceOptions = {
  enabled: boolean;
  docId: string;
  content: string;
  dirty: boolean;
  dirtyRef: React.RefObject<boolean>;
  contentRef: React.RefObject<string>;
  lastSavedContentRef: React.RefObject<string>;
  serverRevision: number;
  serverHash: string;
  getServerSnapshot?: () => { revision: number; hash: string };
  status: EditorSyncStatus;
  extractTitle: (content: string) => string;
  requestSave: (snapshot: Snapshot) => void;
  retry: (snapshot?: Snapshot) => void;
};

export type EditorPersistenceSupport = {
  localBackupUnavailable: boolean;
  flushDraftNow: () => boolean;
  removeLocalDraft: () => boolean;
  titleMissing: boolean;
};

export function useEditorPersistence(opts: UseEditorPersistenceOptions): EditorPersistenceSupport {
  const [localBackupUnavailable, setLocalBackupUnavailable] = useState(false);
  const persistenceFailedRef = useRef(false);
  const optsRef = useRef(opts);
  const draftTimerRef = useRef<number | null>(null);

  useEffect(() => {
    optsRef.current = opts;
  }, [opts]);

  const recordResult = useCallback((ok: boolean) => {
    persistenceFailedRef.current = !ok;
    setLocalBackupUnavailable(!ok);
    return ok;
  }, []);

  const flushDraftNow = useCallback(() => {
    if (typeof window === "undefined") return true;
    const current = optsRef.current;
    if (!current.dirtyRef.current) {
      return recordResult(removeDraft(window.localStorage, current.docId).ok);
    }
    const server = current.getServerSnapshot?.() ?? {
      revision: current.serverRevision,
      hash: current.serverHash,
    };
    const draft = createDraftV2({
      docId: current.docId,
      content: current.contentRef.current,
      baseRevision: server.revision,
      baseContentHash: server.hash,
    });
    return recordResult(flushDraft(window.localStorage, draft).ok);
  }, [recordResult]);

  const removeLocalDraft = useCallback(() => {
    if (typeof window === "undefined") return true;
    return recordResult(removeDraft(window.localStorage, optsRef.current.docId).ok);
  }, [recordResult]);

  useEffect(() => {
    if (!opts.enabled) return;
    if (draftTimerRef.current !== null) window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(flushDraftNow, 250);
    return () => {
      if (draftTimerRef.current !== null) window.clearTimeout(draftTimerRef.current);
      draftTimerRef.current = null;
    };
  }, [flushDraftNow, opts.content, opts.dirty, opts.enabled, opts.serverHash, opts.serverRevision]);

  useEffect(() => {
    if (!opts.enabled) return;
    const handlePageHide = () => { flushDraftNow(); };
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") flushDraftNow();
    };
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!persistenceFailedRef.current) return;
      event.preventDefault();
      Reflect.set(event, "returnValue", "");
    };
    window.addEventListener("pagehide", handlePageHide);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      flushDraftNow();
      window.removeEventListener("pagehide", handlePageHide);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [flushDraftNow, opts.enabled]);

  useAutosaveScheduler({
    content: opts.content,
    dirty: opts.enabled && opts.dirty,
    status: opts.status,
    contentRef: opts.contentRef,
    lastSavedContentRef: opts.lastSavedContentRef,
    extractTitle: opts.extractTitle,
    requestSave: opts.requestSave,
    retry: opts.retry,
  });

  return {
    localBackupUnavailable,
    flushDraftNow,
    removeLocalDraft,
    titleMissing: opts.dirty && !opts.extractTitle(opts.content),
  };
}
