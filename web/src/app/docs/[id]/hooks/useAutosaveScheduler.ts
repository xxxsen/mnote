"use client";

import { useEffect, useRef } from "react";
import type { EditorSyncStatus } from "../types";

type Snapshot = { title: string; content: string };

export type AutosaveSchedulerOptions = {
  content: string;
  dirty: boolean;
  status: EditorSyncStatus;
  contentRef: React.RefObject<string>;
  lastSavedContentRef: React.RefObject<string>;
  extractTitle: (content: string) => string;
  requestSave: (snapshot: Snapshot) => void;
  retry: (snapshot?: Snapshot) => void;
  idleMs?: number;
  maxWaitMs?: number;
};

function latestSnapshot(opts: AutosaveSchedulerOptions): Snapshot | null {
  const content = opts.contentRef.current;
  if (content === opts.lastSavedContentRef.current) return null;
  const title = opts.extractTitle(content);
  return title ? { title, content } : null;
}

export function useAutosaveScheduler(opts: AutosaveSchedulerOptions): void {
  const optsRef = useRef(opts);
  const dirtySinceRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const maxTimerRef = useRef<number | null>(null);

  useEffect(() => {
    optsRef.current = opts;
  }, [opts]);

  useEffect(() => {
    const idleMs = opts.idleMs ?? 2000;
    const maxWaitMs = opts.maxWaitMs ?? 10000;
    const blocked = opts.status === "ERROR" || opts.status === "CONFLICT";

    if (!opts.dirty) {
      dirtySinceRef.current = null;
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
      if (maxTimerRef.current !== null) window.clearTimeout(maxTimerRef.current);
      idleTimerRef.current = null;
      maxTimerRef.current = null;
      return;
    }
    if (blocked) {
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
      if (maxTimerRef.current !== null) window.clearTimeout(maxTimerRef.current);
      idleTimerRef.current = null;
      maxTimerRef.current = null;
      return;
    }

    if (dirtySinceRef.current === null) dirtySinceRef.current = Date.now();
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => {
      const snapshot = latestSnapshot(optsRef.current);
      if (snapshot) optsRef.current.requestSave(snapshot);
    }, idleMs);

    if (maxTimerRef.current === null) {
      const elapsed = Date.now() - dirtySinceRef.current;
      maxTimerRef.current = window.setTimeout(() => {
        maxTimerRef.current = null;
        dirtySinceRef.current = Date.now();
        const snapshot = latestSnapshot(optsRef.current);
        if (snapshot) optsRef.current.requestSave(snapshot);
      }, Math.max(0, maxWaitMs - elapsed));
    }

    return () => {
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    };
  }, [opts.content, opts.dirty, opts.idleMs, opts.maxWaitMs, opts.status]);

  useEffect(() => {
    const handleOnline = () => {
      const current = optsRef.current;
      if (current.status !== "ERROR") return;
      const snapshot = latestSnapshot(current);
      if (snapshot) current.retry(snapshot);
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  useEffect(() => () => {
    if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current);
    if (maxTimerRef.current !== null) window.clearTimeout(maxTimerRef.current);
  }, []);
}
