"use client";

import { memo } from "react";
import type { SaveStatus } from "../types";

type EditorFooterProps = {
  cursorPos: { line: number; col: number };
  wordCount: number;
  charCount: number;
  hasUnsavedChanges: boolean;
  saveStatus: SaveStatus;
};

// saveStatusVisuals enumerates the four footer states surfaced by the
// editor save queue: SYNCED, SAVING, QUEUED and ERROR. Each state has its
// own copy and indicator color so the user can tell whether the last save
// committed, is still in flight, is buffered behind an in-flight request,
// or hit a non-acceptance failure that needs a manual retry. A stale
// save_seq response is not a conflict — the queue silently fast-forwards
// its sequence number and surfaces SYNCED/QUEUED depending on whether
// there is still buffered work; only network/auth-class failures flip the
// footer to ERROR.
const saveStatusVisuals: Record<SaveStatus, { label: string; dot: string }> = {
  SYNCED: { label: "SYNCED", dot: "bg-green-500" },
  SAVING: { label: "SAVING", dot: "bg-sky-500 animate-pulse" },
  QUEUED: { label: "QUEUED", dot: "bg-amber-400" },
  ERROR: { label: "Save failed – click to retry", dot: "bg-rose-500" },
};

export const EditorFooter = memo(function EditorFooter({
  cursorPos, wordCount, charCount, hasUnsavedChanges, saveStatus,
}: EditorFooterProps) {
  // When the save queue is idle (SYNCED) we still want to reflect any
  // unsaved edits the user just typed: those are not yet in the queue but
  // are detectable via hasUnsavedChanges. We surface that as QUEUED to
  // signal "your input is buffered locally and will sync on the next save".
  const effectiveStatus: SaveStatus =
    saveStatus === "SYNCED" && hasUnsavedChanges ? "QUEUED" : saveStatus;
  const visual = saveStatusVisuals[effectiveStatus];
  return (
    <footer className="h-8 border-t border-border bg-background/80 backdrop-blur-sm flex items-center px-4 justify-between text-[10px] font-mono text-muted-foreground z-50 fixed bottom-0 left-0 right-0 transition-all duration-300">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="opacity-50">LN</span> {cursorPos.line}
          <span className="opacity-50">COL</span> {cursorPos.col}
        </div>
        <div className="w-px h-3 bg-border opacity-50" />
        <div className="flex items-center gap-1.5">
          <span>{wordCount} words</span>
          <span>{charCount} chars</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5" data-testid="editor-save-status" data-status={effectiveStatus}>
          <div className={`w-1.5 h-1.5 rounded-full ${visual.dot}`} />
          <span>{visual.label}</span>
        </div>
        <div className="w-px h-3 bg-border opacity-50" />
      </div>
    </footer>
  );
});
