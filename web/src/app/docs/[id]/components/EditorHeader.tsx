"use client";

import { Button } from "@/components/ui/button";
import { Menu } from "@/components/ui/menu";
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
  MoreHorizontal,
  Check,
  Link2,
} from "lucide-react";
import type { EditorSyncStatus } from "../types";
import type { EditorViewMode } from "../hooks/useEditorViewMode";
import { useDesktopViewport } from "../hooks/useDesktopViewport";
import { LinkedNotesTrigger } from "./LinkedNotesTrigger";

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
  scrollSyncEnabled: boolean;
  onToggleScrollSync: () => void;
  linkedNotesOpen: boolean;
  linkedNotesLoaded: boolean;
  linkedNotesCount: number;
  onLinkedNotesTriggerElement: (element: HTMLButtonElement | null) => void;
  onMobileMenuTriggerElement: (element: HTMLButtonElement | null) => void;
  onToggleLinkedNotes: () => void;
  onOpenLinkedNotes: () => void;
};

function primaryState(
  props: Pick<
    Props,
    | "syncStatus"
    | "titleMissing"
    | "onSave"
    | "onRetry"
    | "onResolveConflict"
  >,
) {
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

export function EditorHeader({
  onLinkedNotesTriggerElement,
  onMobileMenuTriggerElement,
  ...props
}: Props) {
  const isDesktop = useDesktopViewport();
  const primary = primaryState(props);
  const displayTitle = props.title || "Untitled";
  const starLabel = props.starred ? "Unstar note" : "Star note";
  const starClass = props.starred ? "text-warning" : "text-muted-foreground";
  const starIconClass = props.starred ? "fill-current" : "";
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-border bg-background/90 px-2 backdrop-blur-md sm:px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to notes"
          onClick={props.onBack}
          className="h-11 w-11 shrink-0 sm:h-10 sm:w-10"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div
          className="min-w-0 truncate text-sm font-semibold"
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
          className={`hidden h-11 w-11 min-[420px]:inline-flex sm:h-10 sm:w-10 ${starClass}`}
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
        {isDesktop ? (
          <LinkedNotesTrigger
            ref={onLinkedNotesTriggerElement}
            open={props.linkedNotesOpen}
            loaded={props.linkedNotesLoaded}
            count={props.linkedNotesCount}
            onClick={props.onToggleLinkedNotes}
          />
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open outline"
          aria-expanded={props.outlineOpen}
          onClick={props.onShowOutline}
          className={`h-11 w-11 sm:h-10 sm:w-10 min-[1280px]:hidden ${
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
          className={`h-11 w-11 sm:h-10 sm:w-10 ${props.detailsOpen ? "bg-accent" : "text-muted-foreground"}`}
        >
          <Columns className="h-4 w-4 rotate-90" />
        </Button>
        {!isDesktop ? (
          <div>
            <Menu
              label="More editor actions"
              trigger={
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              }
              onTriggerElement={onMobileMenuTriggerElement}
              entries={[
                {
                  id: "scroll-sync",
                  label: `Scroll sync ${props.scrollSyncEnabled ? "on" : "off"}`,
                  icon: props.scrollSyncEnabled ? (
                    <Check className="h-4 w-4" />
                  ) : undefined,
                  onSelect: props.onToggleScrollSync,
                },
                {
                  id: "linked-notes",
                  label:
                    props.linkedNotesLoaded && props.linkedNotesCount > 0
                      ? `Linked notes (${props.linkedNotesCount})`
                      : "Linked notes",
                  icon: <Link2 className="h-4 w-4" />,
                  onSelect: props.onOpenLinkedNotes,
                },
                {
                  id: "star",
                  label: starLabel,
                  icon: <Star className={`h-4 w-4 ${starIconClass}`} />,
                  onSelect: props.handleStarToggle,
                },
              ]}
              triggerClassName="h-11 w-11 sm:h-10 sm:w-10"
            />
          </div>
        ) : null}
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
