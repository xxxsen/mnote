"use client";

import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  Columns,
  Edit3,
  Eye,
  ListTree,
  Save,
  Star,
  Columns2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import type { EditorSyncStatus } from "../types";
import type { EditorViewMode } from "../hooks/useEditorViewMode";

type Props = {
  onBack: () => void;
  title: string;
  syncStatus: EditorSyncStatus;
  titleMissing: boolean;
  onSave: () => void;
  onRetry: () => void;
  onResolveConflict: () => void;
  outlineOpen: boolean;
  detailsOpen: boolean;
  onShowOutline: () => void;
  onToggleDetails: () => void;
  starred: number;
  handleStarToggle: () => void;
  viewMode: EditorViewMode;
  setViewMode: (mode: EditorViewMode) => void;
};

function primaryState(props: Props) {
  const busy = props.syncStatus === "SAVING" || props.syncStatus === "QUEUED";
  if (props.syncStatus === "ERROR")
    return { busy, label: "Retry", action: props.onRetry, disabled: false };
  if (props.syncStatus === "CONFLICT")
    return {
      busy,
      label: "Resolve conflict",
      action: props.onResolveConflict,
      disabled: false,
    };
  return {
    busy,
    label: busy ? "Saving…" : "Save",
    action: props.onSave,
    disabled:
      busy ||
      props.syncStatus === "SYNCED" ||
      (props.syncStatus === "LOCAL_CHANGES" && props.titleMissing),
  };
}

function PrimaryStatusIcon({
  status,
  busy,
}: {
  status: EditorSyncStatus;
  busy: boolean;
}) {
  if (status === "CONFLICT") return <ShieldAlert className="mr-1 h-4 w-4" />;
  if (busy || status === "ERROR")
    return (
      <RefreshCw
        className={busy ? "mr-1 h-4 w-4 animate-spin" : "mr-1 h-4 w-4"}
      />
    );
  return <Save className="mr-1 h-4 w-4" />;
}

export function EditorHeader(props: Props) {
  const primary = primaryState(props);
  const displayTitle = props.title || "Untitled";
  const starLabel = props.starred ? "Unstar note" : "Star note";
  const starClass = props.starred ? "text-yellow-500" : "text-muted-foreground";
  const starIconClass = props.starred ? "fill-current" : "";
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-border bg-background/90 px-2 backdrop-blur-md sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to notes"
          onClick={props.onBack}
          className="h-10 w-10 shrink-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div
          className="min-w-0 truncate font-mono text-sm font-semibold"
          title={displayTitle}
        >
          {displayTitle}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label={starLabel}
          onClick={props.handleStarToggle}
          className={`hidden h-10 w-10 min-[420px]:inline-flex ${starClass}`}
        >
          <Star className={`h-4 w-4 ${starIconClass}`} />
        </Button>
        <Button
          size="sm"
          onClick={primary.action}
          disabled={primary.disabled}
          aria-label={primary.label}
          className="h-9 rounded-lg px-2 text-xs font-semibold sm:px-3"
        >
          <PrimaryStatusIcon status={props.syncStatus} busy={primary.busy} />
          <span className="hidden min-[520px]:inline">{primary.label}</span>
        </Button>
        <div
          className="hidden items-center rounded-lg border border-border p-0.5 lg:flex"
          aria-label="Editor view mode"
        >
          <ModeButton
            label="Edit"
            active={props.viewMode === "edit"}
            onClick={() => props.setViewMode("edit")}
          >
            <Edit3 />
          </ModeButton>
          <ModeButton
            label="Split"
            active={props.viewMode === "split"}
            onClick={() => props.setViewMode("split")}
          >
            <Columns2 />
          </ModeButton>
          <ModeButton
            label="Preview"
            active={props.viewMode === "preview"}
            onClick={() => props.setViewMode("preview")}
          >
            <Eye />
          </ModeButton>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open outline"
          aria-expanded={props.outlineOpen}
          onClick={props.onShowOutline}
          className={`h-10 w-10 min-[1280px]:hidden ${
            props.outlineOpen ? "bg-accent" : "text-muted-foreground"
          }`}
        >
          <ListTree className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={props.detailsOpen ? "Show outline" : "Show details"}
          aria-expanded={props.detailsOpen}
          onClick={props.onToggleDetails}
          className={`h-10 w-10 ${props.detailsOpen ? "bg-accent" : "text-muted-foreground"}`}
        >
          <Columns className="h-4 w-4 rotate-90" />
        </Button>
      </div>
    </header>
  );
}

function ModeButton(props: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={`${props.label} view`}
      aria-pressed={props.active}
      title={`${props.label} view`}
      onClick={props.onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-md [&_svg]:h-4 [&_svg]:w-4 ${props.active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
    >
      {props.children}
    </button>
  );
}
