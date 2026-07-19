"use client";

import { memo } from "react";
import type { EditorSyncStatus } from "../types";

type Props = {
  cursorPos: { line: number; col: number };
  wordCount: number;
  charCount: number;
  saveStatus: EditorSyncStatus;
  hasUnsavedChanges?: boolean;
  titleMissing?: boolean;
  onRetry?: () => void;
};

const visuals: Record<EditorSyncStatus, { label: string; dot: string }> = {
  SYNCED: { label: "Synced", dot: "bg-success" },
  LOCAL_CHANGES: { label: "Local changes", dot: "bg-warning" },
  SAVING: { label: "Saving…", dot: "bg-info animate-pulse motion-reduce:animate-none" },
  QUEUED: { label: "Saving latest changes…", dot: "bg-warning animate-pulse motion-reduce:animate-none" },
  ERROR: { label: "Save failed — Retry", dot: "bg-destructive" },
  CONFLICT: { label: "Conflict needs attention", dot: "bg-destructive" },
};

export const EditorFooter = memo(function EditorFooter({
  cursorPos,
  wordCount,
  charCount,
  saveStatus,
  titleMissing = false,
  onRetry,
}: Props) {
  const visual = titleMissing && saveStatus === "LOCAL_CHANGES"
    ? { label: "Draft saved locally — add a title to sync", dot: "bg-warning" }
    : visuals[saveStatus];
  const statusContent = (
    <>
      <span className={`h-1.5 w-1.5 rounded-full ${visual.dot}`} aria-hidden="true" />
      <span>{visual.label}</span>
    </>
  );
  return (
    <footer className="fixed inset-x-0 bottom-0 z-50 flex min-h-8 items-center justify-between border-t border-border bg-background/90 px-3 pb-[env(safe-area-inset-bottom)] font-mono text-xs text-muted-foreground backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <span>LN {cursorPos.line} · COL {cursorPos.col}</span>
        <span className="hidden sm:inline">{wordCount} words · {charCount} chars</span>
      </div>
      <div aria-live="polite" className="flex items-center">
        {saveStatus === "ERROR" ? (
          <button
            type="button"
            role="alert"
            onClick={onRetry}
            className="flex min-h-8 items-center gap-1.5 rounded px-2 text-destructive hover:bg-destructive/10"
            data-testid="editor-save-status"
            data-status={saveStatus}
          >
            {statusContent}
          </button>
        ) : (
          <div className="flex items-center gap-1.5" data-testid="editor-save-status" data-status={saveStatus}>
            {statusContent}
          </div>
        )}
      </div>
    </footer>
  );
});
