"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SaveDocumentResult, SaveStatus } from "../types";

// Snapshot the editor hands to the queue. We carry the user-visible title
// alongside content so the queue can submit them as a single atomic save.
export type SaveSnapshot = {
  title: string;
  content: string;
};

// SaveFn is the network-bound callback the queue uses to actually persist a
// snapshot. The queue passes the save_seq it is using for this attempt so
// the underlying service can echo it into the PUT body.
export type SaveFn = (snapshot: SaveSnapshot, saveSeq: number) => Promise<SaveDocumentResult>;

export type SaveSuccessPayload = {
  snapshot: SaveSnapshot;
  result: SaveDocumentResult;
  // isLatest reports whether, at the moment the queue invoked onSaved,
  // queuedRef.current still referenced a snapshot that differs from the
  // one the server just accepted. When false the caller must NOT treat
  // the just-saved snapshot as fully synced — a newer snapshot is
  // already on its way and the editor's draft has not yet caught up.
  // Callers should additionally compare snapshot.content against their
  // current authoritative source (e.g. a contentRef) because the queue
  // can only observe whatever was published to requestSave; in-flight
  // keystrokes that have not been published are not visible here.
  isLatest: boolean;
};

// SaveStalePayload is the queue's report of an accepted=false response.
// It is not a conflict; the queue simply observed that the server already
// processed a save with this or a higher save_seq and fast-forwards its
// local sequence number to match the response. The editor keeps its
// in-progress draft and the next save resumes from the new save_seq.
export type SaveStalePayload = {
  snapshot: SaveSnapshot;
  result: SaveDocumentResult;
};

export interface UseEditorSaveQueueOptions {
  initialRevision: number;
  initialSavedContent: string;
  initialSavedTitle: string;
  save: SaveFn;
  onSaved?: (payload: SaveSuccessPayload) => void;
  onStale?: (payload: SaveStalePayload) => void;
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
  // resyncRevision lets the caller seed the local save_seq baseline from
  // the server's current content_revision (typically at page load) without
  // emitting a save.
  resyncRevision: (next: { revision: number; title?: string; content?: string; mtime?: number | null }) => void;
  // setLastSavedAt is exposed so non-content save flows (tag updates, AI
  // summary writes) can refresh the footer timestamp without going through
  // the content save queue. They don't touch content_revision.
  setLastSavedAt: (ts: number) => void;
}

// useEditorSaveQueue serialises editor save requests behind a single-flight
// lock so concurrent Ctrl+S, auto-save and other triggers cannot produce
// overlapping PUT /documents/:id requests. The queue cooperates with the
// server-side save_seq protocol: each save carries a locally-incremented
// save_seq, and a response of accepted=false is treated as "the server
// already saw a higher seq" — the queue fast-forwards its counter but the
// editor draft is left untouched.
export function useEditorSaveQueue(opts: UseEditorSaveQueueOptions): UseEditorSaveQueueReturn {
  const { save, onSaved, onStale, onError } = opts;

  const inFlightRef = useRef(false);
  const queuedRef = useRef<SaveSnapshot | null>(null);
  // readQueued forces eslint/TS to widen queuedRef.current back to its
  // declared type. Without this indirection, control-flow analysis narrows
  // the ref to `null` immediately after every direct assignment, defeating
  // the post-await re-check that drives the recursive drain loop.
  const readQueued = useCallback((): SaveSnapshot | null => queuedRef.current, []);
  // saveSeqRef tracks the next save_seq the queue will publish. It starts
  // at the server's reported content_revision and is incremented strictly
  // before each PUT so two queued snapshots never share a sequence number.
  const saveSeqRef = useRef<number>(opts.initialRevision);
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
  const onStaleRef = useRef(onStale);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onSavedRef.current = onSaved;
    onStaleRef.current = onStale;
    onErrorRef.current = onError;
  }, [onSaved, onStale, onError]);

  const commitAccepted = useCallback((snapshot: SaveSnapshot, result: SaveDocumentResult) => {
    saveSeqRef.current = result.content_revision;
    lastSavedContentRef.current = snapshot.content;
    lastSavedTitleRef.current = snapshot.title;
    setServerRevision(result.content_revision);
    setLastSavedContent(snapshot.content);
    setLastSavedTitle(snapshot.title);
    setLastSavedAt(result.content_mtime || result.mtime || null);
    // Decide isLatest BEFORE invoking onSaved so the caller can use it to
    // gate side effects (e.g. clearing the localStorage draft). Once
    // lastSavedContentRef has been advanced above, a "pending differs
    // from lastSaved" check is the same test that the post-onSaved
    // hasMore branch uses to schedule the next drainQueue iteration.
    const pending = readQueued();
    const hasMore =
      pending !== null &&
      (pending.content !== lastSavedContentRef.current ||
        pending.title !== lastSavedTitleRef.current);
    onSavedRef.current?.({ snapshot, result, isLatest: !hasMore });
    if (hasMore) {
      setStatus("QUEUED");
    } else {
      queuedRef.current = null;
      setStatus("SYNCED");
    }
  }, [setStatus, readQueued]);

  const commitStale = useCallback((snapshot: SaveSnapshot, result: SaveDocumentResult) => {
    // The server already processed a save with a higher (or equal) seq.
    // We fast-forward our local counter so the next save uses a fresh seq
    // strictly above the server's current revision; the editor's draft
    // and lastSaved* refs are intentionally left untouched.
    saveSeqRef.current = result.content_revision;
    setServerRevision(result.content_revision);
    onStaleRef.current?.({ snapshot, result });
    const pending = readQueued();
    const hasMore =
      pending !== null &&
      (pending.content !== lastSavedContentRef.current ||
        pending.title !== lastSavedTitleRef.current);
    if (hasMore) {
      setStatus("QUEUED");
    } else {
      queuedRef.current = null;
      // After a stale response the draft is still unsynced (lastSaved* did
      // not advance), so the footer keeps showing the prior status: SYNCED
      // would falsely claim the draft is persisted, so we surface QUEUED
      // when there is a pending snapshot and otherwise leave the editor in
      // a "still has unsaved changes" SYNCED-without-draft-match state by
      // returning to SYNCED. The page's hasUnsavedChanges flag remains
      // true because lastSavedContentRef did not move.
      setStatus("SYNCED");
    }
  }, [setStatus, readQueued]);

  const commitFailure = useCallback((snapshot: SaveSnapshot, err: unknown) => {
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

    // Increment the local sequence number BEFORE issuing the request so
    // two snapshots scheduled in the same tick never reuse a seq. The
    // server will accept the larger of the two and silently fast-forward
    // past the smaller one.
    saveSeqRef.current += 1;
    const seq = saveSeqRef.current;
    try {
      const result = await save(next, seq);
      if (result.accepted) {
        commitAccepted(next, result);
      } else {
        commitStale(next, result);
      }
    } catch (err) {
      commitFailure(next, err);
    } finally {
      inFlightRef.current = false;
    }

    // If a fresh snapshot landed while we were running and the result
    // wasn't an error, kick off the next iteration via the mutable ref so
    // we always observe the current status rather than a stale closure copy.
    const pendingAfter = readQueued();
    const blocked = statusRef.current === "ERROR";
    if (pendingAfter && !blocked) {
      void drainQueue();
    }
  }, [save, commitAccepted, commitStale, commitFailure, setStatus, readQueued]);

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
      // sets it before awaiting and only flips to ERROR once the request
      // resolves), so it is always safe to surface QUEUED here.
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
    saveSeqRef.current = next.revision;
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
