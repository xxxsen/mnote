"use client";

import { memo } from "react";

type EditorFooterProps = {
  cursorPos: { line: number; col: number };
  wordCount: number;
  charCount: number;
  hasUnsavedChanges: boolean;
};

export const EditorFooter = memo(function EditorFooter({ cursorPos, wordCount, charCount, hasUnsavedChanges }: EditorFooterProps) {
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
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${hasUnsavedChanges ? "bg-amber-400" : "bg-green-500"}`} />
          <span>{hasUnsavedChanges ? "UNSAVED" : "SYNCED"}</span>
        </div>
        <div className="w-px h-3 bg-border opacity-50" />
      </div>
    </footer>
  );
});
