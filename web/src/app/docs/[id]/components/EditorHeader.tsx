"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Columns, Folder, Home, RefreshCw, Save, Star } from "lucide-react";

type RouterLike = {
  push: (href: string) => void;
};

type EditorHeaderProps = {
  router: RouterLike;
  title: string;
  handleSave: () => void;
  saving: boolean;
  hasUnsavedChanges: boolean;
  lastSavedAt: number | null;
  showDetails: boolean;
  setShowDetails: (v: boolean) => void;
  loadVersions: () => void;
  starred: number;
  handleStarToggle: () => void;
};

export const EditorHeader = memo(function EditorHeader({
  router,
  title,
  handleSave,
  saving,
  hasUnsavedChanges,
  lastSavedAt,
  showDetails,
  setShowDetails,
  loadVersions,
  starred,
  handleStarToggle,
}: EditorHeaderProps) {
  return (
    <header className="h-14 border-b border-border flex items-center px-4 gap-4 justify-between bg-background/80 backdrop-blur-md z-40 sticky top-0 transition-all duration-300">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Button variant="ghost" size="icon" onClick={() => router.push("/docs")} className="h-8 w-8">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground overflow-hidden">
          <div className="flex items-center gap-1 hover:text-foreground cursor-pointer transition-colors shrink-0" onClick={() => router.push("/docs")}>
            <Home className="h-3 w-3" />
            <span className="hidden sm:inline">My Notes</span>
          </div>
          <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
          <div className="flex items-center gap-1 shrink-0">
            <Folder className="h-3 w-3 opacity-70" />
            <span className="hidden sm:inline">General</span>
          </div>
          <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
          <div className="font-bold font-mono truncate text-foreground select-none max-w-[120px] sm:max-w-[200px] md:max-w-md">
            {title || "Untitled"}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {lastSavedAt && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 text-[10px] text-muted-foreground font-mono hidden md:flex">
            <div className={`w-1.5 h-1.5 rounded-full ${hasUnsavedChanges ? "bg-amber-400 animate-pulse" : "bg-green-500"}`} />
            {hasUnsavedChanges ? "Unsaved Changes" : `Saved: ${formatDate(lastSavedAt)}`}
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleStarToggle}
          className={`h-8 w-8 transition-colors ${starred ? "text-yellow-500" : "text-muted-foreground"}`}
          title={starred ? "Unstar" : "Star"}
        >
          <Star className={`h-4 w-4 ${starred ? "fill-current" : ""}`} />
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving || !hasUnsavedChanges} className="rounded-xl h-8 text-xs font-bold px-3">
          {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setShowDetails(!showDetails);
            if (!showDetails) loadVersions();
          }}
          className={`h-8 w-8 ${showDetails ? "bg-accent text-foreground" : "text-muted-foreground"}`}
        >
          <Columns className="h-4 w-4 rotate-90" />
        </Button>
      </div>
    </header>
  );
});
