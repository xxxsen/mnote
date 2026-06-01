"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { ERR_CONFLICT_CODE } from "../constants";
import type { SaveDocumentConflict, SaveDocumentResult, SaveStatus } from "../types";

// Snapshot the editor hands to the queue. We carry the user-visible title
// alongside content so the queue can submit them as a single atomic save.
export type SaveSnapshot = {
  title: string;
  content: string;
};

// SaveFn is the network-bound callback the queue uses to actually persist a
// snapshot. The queue passes the base_revision it is using for this attempt
// so the underlying service can echo it into the PUT body for BE-3.
export type SaveFn = (snapshot: SaveSnapshot, baseRevision: number) => Promise<SaveDocumentResult>;

export type SaveSuccessPayload = {
  snapshot: SaveSnapshot;
  result: SaveDocumentResult;
};

export type SaveConflictPayload = {
  snapshot: SaveSnapshot;
  current: SaveDocumentConflict | null;
};

export interface UseEditorSaveQueueOptions {
  initialRevision: number;
  initialSavedContent: string;
  initialSavedTitle: string;
  save: SaveFn;
  onSaved?: (payload: SaveSuccessPayload) => void;
  onConflict?: (payload: SaveConflictPayload) => void;
  onError?: (err: unknown, snapshot: SaveSnapshot) => void;
}

export interface UseEditorSaveQueueReturn {
  status: SaveStatus;
  lastSavedAt: number | null;
  lastSavedContent: string;
  lastSavedTitle: string;
  serverRevision: number;
  // requestSave hands a snapshot to the queue. The queue:
  //   - if no save is in-flight: issues the request immediately;
  //   - if a save is already in-flight: replaces any previously queued
  //     snapshot, ensuring at most one PUT is enqueued behind the active one.
  requestSave: (snapshot: SaveSnapshot) => void;
  // resyncRevision lets the caller advance the local server revision/content
  // after the editor has separately fetched the conflicting server snapshot
  // (e.g. inside a conflict handler).
  resyncRevision: (next: { revision: number; title?: string; content?: string; mtime?: number | null }) => void;
  // setLastSavedAt is exposed so non-content save flows (tag updates, AI
  // summary writes) can refresh the footer timestamp without going through
  // the content save queue. They don't touch content_revision.
  setLastSavedAt: (ts: number) => void;
}

function parseConflictData(err: unknown): SaveDocumentConflict | null {
  if (!(err instanceof ApiError)) return null;
  if (err.code !== ERR_CONFLICT_CODE) return null;
  const payload = err.data;
  if (!payload || typeof payload !== "object") return null;
  const current = (payload as { current?: unknown }).current;
  if (!current || typeof current !== "object") return null;
  const c = current as Partial<SaveDocumentConflict>;
  if (
    typeof c.id !== "string" ||
    typeof c.title !== "string" ||
    typeof c.content !== "string" ||
    typeof c.content_revision !== "number" ||
    typeof c.content_mtime !== "number"
  ) {
    return null;
  }
  return {
    id: c.id,
    title: c.title,
    content: c.content,
    content_revision: c.content_revision,
    content_mtime: c.content_mtime,
  };
}

// useEditorSaveQueue serialises editor save requests behind a single-flight
// lock so concurrent Ctrl+S, auto-save and other triggers cannot produce
// overlapping PUT /documents/:id requests. The queue cooperates with the
// server-side optimistic concurrency check: each save carries a base
// revision derived from the most recent server snapshot, so a stale write
// is rejected as a conflict rather than silently overwriting fresher
// content.
export function useEditorSaveQueue(opts: UseEditorSaveQueueOptions): UseEditorSaveQueueReturn {
  const { save, onSaved, onConflict, onError } = opts;

  const inFlightRef = useRef(false);
  const queuedRef = useRef<SaveSnapshot | null>(null);
  // readQueued forces eslint/TS to widen queuedRef.current back to its
  // declared type. Without this indirection, control-flow analysis narrows
  // the ref to `null` immediately after every direct assignment, defeating
  // the post-await re-check that drives the recursive drain loop.
  const readQueued = useCallback((): SaveSnapshot | null => queuedRef.current, []);
  const serverRevisionRef = useRef<number>(opts.initialRevision);
  const lastSavedContentRef = useRef<string>(opts.initialSavedContent);
  const lastSavedTitleRef = useRef<string>(opts.initialSavedTitle);
  // statusRef mirrors the React `status` state so the recursive drain loop
  // can decide whether to keep draining without depending on a stale closure.
  const statusRef = useRef<SaveStatus>("SYNCED");

  const [status, setStatusState] = useState<SaveStatus>("SYNCED");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [serverRevision, setServerRevision] = useState<number>(opts.initialRevision);
  const [lastSavedContent, setLastSavedContent] = useState<string>(opts.initialSavedContent);
  const [lastSavedTitle, setLastSavedTitle] = useState<string>(opts.initialSavedTitle);

  const setStatus = useCallback((next: SaveStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const onSavedRef = useRef(onSaved);
  const onConflictRef = useRef(onConflict);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSavedRef.current = onSaved;
    onConflictRef.current = onConflict;
    onErrorRef.current = onError;
  }, [onSaved, onConflict, onError]);

  const commitSuccess = useCallback((snapshot: SaveSnapshot, result: SaveDocumentResult) => {
    serverRevisionRef.current = result.content_revision;
    lastSavedContentRef.current = snapshot.content;
    lastSavedTitleRef.current = snapshot.title;
    setServerRevision(result.content_revision);
    setLastSavedContent(snapshot.content);
    setLastSavedTitle(snapshot.title);
    setLastSavedAt(result.content_mtime || result.mtime || null);
    onSavedRef.current?.({ snapshot, result });
    const pending = readQueued();
    const hasMore =
      pending !== null &&
      (pending.content !== lastSavedContentRef.current ||
        pending.title !== lastSavedTitleRef.current);
    if (hasMore) {
      setStatus("QUEUED");
    } else {
      queuedRef.current = null;
      setStatus("SYNCED");
    }
  }, [setStatus, readQueued]);

  const commitFailure = useCallback((snapshot: SaveSnapshot, err: unknown) => {
    const conflict = parseConflictData(err);
    if (conflict) {
      // CONFLICT: refresh our base revision from the server snapshot but
      // explicitly do NOT overwrite the user's draft (lastSavedContentRef
      // stays unchanged so the editor's hasUnsavedChanges remains true).
      serverRevisionRef.current = conflict.content_revision;
      setServerRevision(conflict.content_revision);
      setStatus("CONFLICT");
      onConflictRef.current?.({ snapshot, current: conflict });
      return;
    }
    setStatus("ERROR");
    onErrorRef.current?.(err, snapshot);
  }, [setStatus]);

  const drainQueue = useCallback(async () => {
    // drainQueue runs the snapshot in queuedRef under the single-flight lock
    // and recursively schedules the next snapshot if more save requests
    // arrived while the previous one was in flight.
    //
    // requestSave is the only external entry point and it only calls
    // drainQueue when neither inFlightRef is set nor queuedRef is empty,
    // so the defensive top-of-function bail-out is intentionally absent
    // here — the recursive path at the end of this function also re-checks
    // queuedRef before issuing the next iteration.
    const next = queuedRef.current;
    /* v8 ignore next -- defensive: queuedRef is non-null at every caller. */
    if (!next) return;
    queuedRef.current = null;
    inFlightRef.current = true;
    setStatus("SAVING");

    const baseRevision = serverRevisionRef.current;
    try {
      const result = await save(next, baseRevision);
      commitSuccess(next, result);
    } catch (err) {
      commitFailure(next, err);
    } finally {
      inFlightRef.current = false;
    }

    // If a fresh snapshot landed while we were running and the result wasn't
    // a conflict/error, kick off the next iteration via the mutable ref so
    // we always observe the current status rather than a stale closure copy.
    const pendingAfter = readQueued();
    const blocked = statusRef.current === "CONFLICT" || statusRef.current === "ERROR";
    if (pendingAfter && !blocked) {
      void drainQueue();
    }
  }, [save, commitSuccess, commitFailure, setStatus, readQueued]);

  const requestSave = useCallback((snapshot: SaveSnapshot) => {
    // Skip no-op saves so users hammering Ctrl+S on an unchanged doc don't
    // spam the network or flicker the footer between SYNCED/SAVING.
    if (
      snapshot.content === lastSavedContentRef.current &&
      snapshot.title === lastSavedTitleRef.current &&
      !inFlightRef.current
    ) {
      return;
    }
    queuedRef.current = snapshot;
    if (inFlightRef.current) {
      // While a save is in flight, status is necessarily SAVING (drainQueue
      // sets it before awaiting and only flips to CONFLICT/ERROR once the
      // request resolves), so it is always safe to surface QUEUED here.
      setStatus("QUEUED");
      return;
    }
    void drainQueue();
  }, [drainQueue, setStatus]);

  const resyncRevision = useCallback((next: {
    revision: number;
    title?: string;
    content?: string;
    mtime?: number | null;
  }) => {
    serverRevisionRef.current = next.revision;
    setServerRevision(next.revision);
    if (typeof next.title === "string") {
      lastSavedTitleRef.current = next.title;
      setLastSavedTitle(next.title);
    }
    if (typeof next.content === "string") {
      lastSavedContentRef.current = next.content;
      setLastSavedContent(next.content);
    }
    if (typeof next.mtime === "number") {
      setLastSavedAt(next.mtime);
    }
  }, []);

  return {
    status,
    lastSavedAt,
    lastSavedContent,
    lastSavedTitle,
    serverRevision,
    requestSave,
    resyncRevision,
    setLastSavedAt,
  };
}
