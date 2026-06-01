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

// saveStatusVisuals enumerates the five footer states surfaced by the
// editor save queue: SYNCED, SAVING, QUEUED, CONFLICT and ERROR. Each state
// has its own copy and indicator color so the user can tell whether the
// last save committed, is still in flight, was overtaken by a server-side
// change, or hit a non-conflict failure that needs a manual retry. The
// CONFLICT and ERROR copies are intentionally directive so the user knows
// the next action; the editor stays editable in every state so typing
// continues to land in the queue.
const saveStatusVisuals: Record<SaveStatus, { label: string; dot: string }> = {
  SYNCED: { label: "SYNCED", dot: "bg-green-500" },
  SAVING: { label: "SAVING", dot: "bg-sky-500 animate-pulse" },
  QUEUED: { label: "QUEUED", dot: "bg-amber-400" },
  CONFLICT: { label: "Conflict – save to merge", dot: "bg-orange-500" },
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
