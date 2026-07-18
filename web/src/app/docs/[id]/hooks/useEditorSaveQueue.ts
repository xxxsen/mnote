"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SaveDocumentResult, SaveStatus } from "../types";

export type SaveSnapshot = {
  title: string;
  content: string;
};

export type SaveFn = (
  snapshot: SaveSnapshot,
  saveSeq: number,
  baseRevision: number,
) => Promise<SaveDocumentResult>;

export type SaveSuccessPayload = {
  snapshot: SaveSnapshot;
  result: SaveDocumentResult;
  isLatest: boolean;
};

export type SaveStalePayload = {
  snapshot: SaveSnapshot;
  result: SaveDocumentResult;
};

export interface UseEditorSaveQueueOptions {
  initialRevision: number;
  initialHash?: string;
  initialSavedContent: string;
  initialSavedTitle: string;
  save: SaveFn;
  onSaved?: (payload: SaveSuccessPayload) => void;
  onStale?: (payload: SaveStalePayload) => void;
  onConflict?: (payload: SaveStalePayload) => void;
  onError?: (err: unknown, snapshot: SaveSnapshot) => void;
}

export interface UseEditorSaveQueueReturn {
  status: SaveStatus;
  lastSavedAt: number | null;
  lastSavedContent: string;
  lastSavedTitle: string;
  serverRevision: number;
  serverHash: string;
  conflictSnapshot: SaveSnapshot | null;
  requestSave: (snapshot: SaveSnapshot) => void;
  markLocalChanges: () => void;
  retry: (snapshot?: SaveSnapshot) => void;
  resyncRevision: (next: {
    revision: number;
    hash?: string;
    title?: string;
    content?: string;
    mtime?: number | null;
  }) => void;
  setLastSavedAt: (ts: number) => void;
  getServerSnapshot: () => { revision: number; hash: string };
}

export function useEditorSaveQueue(opts: UseEditorSaveQueueOptions): UseEditorSaveQueueReturn {
  const { save, onSaved, onStale, onConflict, onError } = opts;

  const inFlightRef = useRef(false);
  const queuedRef = useRef<SaveSnapshot | null>(null);
  const failedSnapshotRef = useRef<SaveSnapshot | null>(null);
  const baseRevisionRef = useRef(opts.initialRevision);
  const serverHashRef = useRef(opts.initialHash ?? "");
  const saveSeqRef = useRef(opts.initialRevision);
  const lastSavedContentRef = useRef(opts.initialSavedContent);
  const lastSavedTitleRef = useRef(opts.initialSavedTitle);
  const statusRef = useRef<SaveStatus>("SYNCED");
  const editEpochRef = useRef(0);

  const [status, setStatusState] = useState<SaveStatus>("SYNCED");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [serverRevision, setServerRevision] = useState(opts.initialRevision);
  const [serverHash, setServerHash] = useState(opts.initialHash ?? "");
  const [lastSavedContent, setLastSavedContent] = useState(opts.initialSavedContent);
  const [lastSavedTitle, setLastSavedTitle] = useState(opts.initialSavedTitle);
  const [conflictSnapshot, setConflictSnapshot] = useState<SaveSnapshot | null>(null);

  const setStatus = useCallback((next: SaveStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const callbacksRef = useRef({ onSaved, onStale, onConflict, onError });
  useEffect(() => {
    callbacksRef.current = { onSaved, onStale, onConflict, onError };
  }, [onSaved, onStale, onConflict, onError]);

  const readQueued = useCallback((): SaveSnapshot | null => queuedRef.current, []);

  const commitAccepted = useCallback((
    snapshot: SaveSnapshot,
    result: SaveDocumentResult,
    requestEditEpoch: number,
  ) => {
    baseRevisionRef.current = result.content_revision;
    serverHashRef.current = result.content_hash;
    saveSeqRef.current = Math.max(saveSeqRef.current, result.content_revision);
    lastSavedContentRef.current = snapshot.content;
    lastSavedTitleRef.current = snapshot.title;
    failedSnapshotRef.current = null;
    setServerRevision(result.content_revision);
    setServerHash(result.content_hash);
    setLastSavedContent(snapshot.content);
    setLastSavedTitle(snapshot.title);
    setLastSavedAt(result.content_mtime || result.mtime || null);

    const pending = readQueued();
    const hasQueuedSnapshot = pending !== null && (
      pending.content !== snapshot.content || pending.title !== snapshot.title
    );
    const editedDuringRequest = editEpochRef.current !== requestEditEpoch;
    callbacksRef.current.onSaved?.({
      snapshot,
      result,
      isLatest: !hasQueuedSnapshot && !editedDuringRequest,
    });
    if (hasQueuedSnapshot) {
      setStatus("QUEUED");
    } else if (editedDuringRequest) {
      setStatus("LOCAL_CHANGES");
    } else {
      queuedRef.current = null;
      setStatus("SYNCED");
    }
  }, [readQueued, setStatus]);

  const commitRejected = useCallback((snapshot: SaveSnapshot, result: SaveDocumentResult) => {
    if (result.reason === "revision_conflict") {
      queuedRef.current = snapshot;
      setConflictSnapshot(snapshot);
      setStatus("CONFLICT");
      callbacksRef.current.onConflict?.({ snapshot, result });
      return;
    }

    // Rolling compatibility with an old save_seq-only backend. New
    // base_revision-aware servers use revision_conflict above.
    saveSeqRef.current = Math.max(saveSeqRef.current, result.content_revision);
    setServerRevision(result.content_revision);
    setServerHash(result.content_hash);
    callbacksRef.current.onStale?.({ snapshot, result });
    const pending = readQueued();
    if (pending && (
      pending.content !== lastSavedContentRef.current ||
      pending.title !== lastSavedTitleRef.current
    )) {
      setStatus("QUEUED");
    } else {
      queuedRef.current = null;
      setStatus("LOCAL_CHANGES");
    }
  }, [readQueued, setStatus]);

  const commitFailure = useCallback((snapshot: SaveSnapshot, error: unknown) => {
    failedSnapshotRef.current = snapshot;
    if (queuedRef.current === null) queuedRef.current = snapshot;
    setStatus("ERROR");
    callbacksRef.current.onError?.(error, snapshot);
  }, [setStatus]);

  const drainQueue = useCallback(async () => {
    const next = queuedRef.current;
    if (!next || inFlightRef.current) return;
    if (statusRef.current === "ERROR" || statusRef.current === "CONFLICT") return;

    queuedRef.current = null;
    inFlightRef.current = true;
    setStatus("SAVING");
    saveSeqRef.current += 1;
    const saveSeq = saveSeqRef.current;
    const baseRevision = baseRevisionRef.current;
    const requestEditEpoch = editEpochRef.current;

    try {
      const result = await save(next, saveSeq, baseRevision);
      if (result.accepted) {
        commitAccepted(next, result, requestEditEpoch);
      } else {
        commitRejected(next, result);
      }
    } catch (error) {
      commitFailure(next, error);
    } finally {
      inFlightRef.current = false;
    }

    if (readQueued() && !["ERROR", "CONFLICT"].includes(statusRef.current)) {
      void drainQueue();
    }
  }, [commitAccepted, commitFailure, commitRejected, readQueued, save, setStatus]);

  const requestSave = useCallback((snapshot: SaveSnapshot) => {
    if (
      snapshot.content === lastSavedContentRef.current &&
      snapshot.title === lastSavedTitleRef.current &&
      !inFlightRef.current
    ) {
      setStatus("SYNCED");
      return;
    }
    queuedRef.current = snapshot;
    if (statusRef.current === "CONFLICT") {
      setConflictSnapshot(snapshot);
      return;
    }
    if (statusRef.current === "ERROR") return;
    if (inFlightRef.current) {
      setStatus("QUEUED");
      return;
    }
    void drainQueue();
  }, [drainQueue, setStatus]);

  const markLocalChanges = useCallback(() => {
    editEpochRef.current += 1;
    if (statusRef.current === "ERROR" || statusRef.current === "CONFLICT") return;
    setStatus(inFlightRef.current ? "QUEUED" : "LOCAL_CHANGES");
  }, [setStatus]);

  const retry = useCallback((snapshot?: SaveSnapshot) => {
    if (statusRef.current === "CONFLICT") return;
    const next = snapshot ?? queuedRef.current ?? failedSnapshotRef.current;
    if (!next) return;
    queuedRef.current = next;
    failedSnapshotRef.current = null;
    setStatus("LOCAL_CHANGES");
    void drainQueue();
  }, [drainQueue, setStatus]);

  const resyncRevision = useCallback((next: {
    revision: number;
    hash?: string;
    title?: string;
    content?: string;
    mtime?: number | null;
  }) => {
    baseRevisionRef.current = next.revision;
    saveSeqRef.current = Math.max(saveSeqRef.current, next.revision);
    setServerRevision(next.revision);
    if (typeof next.hash === "string") {
      serverHashRef.current = next.hash;
      setServerHash(next.hash);
    }
    if (typeof next.title === "string") {
      lastSavedTitleRef.current = next.title;
      setLastSavedTitle(next.title);
    }
    if (typeof next.content === "string") {
      lastSavedContentRef.current = next.content;
      setLastSavedContent(next.content);
    }
    if (typeof next.mtime === "number") setLastSavedAt(next.mtime);
    queuedRef.current = null;
    failedSnapshotRef.current = null;
    setConflictSnapshot(null);
    setStatus("SYNCED");
  }, [setStatus]);

  const getServerSnapshot = useCallback(
    () => ({ revision: baseRevisionRef.current, hash: serverHashRef.current }), []);

  return {
    status,
    lastSavedAt,
    lastSavedContent,
    lastSavedTitle,
    serverRevision,
    serverHash,
    conflictSnapshot,
    requestSave,
    markLocalChanges,
    retry,
    resyncRevision,
    setLastSavedAt,
    getServerSnapshot,
  };
}
