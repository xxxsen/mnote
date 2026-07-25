"use client";

import { useEffect, useRef, type ReactNode } from "react";
import {
  ChevronLeft,
  FileText,
  ListTree,
  PanelRightClose,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogHeader } from "@/components/ui/dialog";
import type { OutlineEntry } from "@/components/markdown-preview/types";
import type { EditorShellFlatContract } from "../editor-contracts";
import { useDesktopViewport } from "../hooks/useDesktopViewport";
import { DetailsPanelContent } from "./DetailsPanelContent";

export function EditorContextRail({ p }: { p: EditorShellFlatContract }) {
  if (!p.contextRail.isDocked) return null;
  if (p.contextRail.collapsed) {
    return <CollapsedContextRail p={p} />;
  }
  return (
    <aside
      role="complementary"
      aria-label="Document context"
      data-testid="editor-context-rail"
      className="flex h-full w-[304px] shrink-0 flex-col border-l border-border bg-background"
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-semibold text-muted-foreground">
          {p.contextRail.view === "details" ? "Document details" : "Outline"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Collapse document context rail"
          title="Collapse document context rail"
          className="h-10 w-10"
          onClick={p.contextRail.toggleCollapsed}
        >
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </div>
      <EditorContextContent p={p} closeAfterNavigate={false} />
    </aside>
  );
}

export function EditorContextDrawer({ p }: { p: EditorShellFlatContract }) {
  if (p.contextRail.isDocked) return null;
  const title =
    p.contextRail.view === "details" ? "Document details" : "Outline";
  return (
    <Dialog
      open={p.contextRail.drawerOpen}
      title={title}
      description="Navigate this note or manage its document details."
      variant="drawer"
      drawerWidth="compact"
      onClose={p.contextRail.closeDrawer}
    >
      <DialogHeader className="py-3" />
      <DialogBody className="flex flex-col overflow-hidden p-0">
        <EditorContextContent p={p} closeAfterNavigate />
      </DialogBody>
    </Dialog>
  );
}

function CollapsedContextRail({ p }: { p: EditorShellFlatContract }) {
  const buttons: Array<{
    label: string;
    focusTarget: "outline" | "details";
    icon: ReactNode;
    onClick: () => void;
    active: boolean;
  }> = [
    {
      label: "Expand document context rail",
      focusTarget: p.contextRail.view,
      icon: <ChevronLeft className="h-4 w-4" />,
      onClick: p.contextRail.toggleCollapsed,
      active: false,
    },
    {
      label: "Open outline",
      focusTarget: "outline",
      icon: <ListTree className="h-4 w-4" />,
      onClick: p.contextRail.openOutline,
      active: p.contextRail.view === "outline",
    },
    {
      label: "Open document details",
      focusTarget: "details",
      icon: <FileText className="h-4 w-4" />,
      onClick: () => p.contextRail.openDetails(),
      active: p.contextRail.view === "details",
    },
  ];
  return (
    <aside
      role="complementary"
      aria-label="Document context"
      data-testid="editor-context-rail-collapsed"
      className="flex h-full w-[52px] shrink-0 flex-col items-center gap-1 border-l border-border bg-background py-1"
    >
      {buttons.map((button) => (
        <button
          key={button.label}
          type="button"
          aria-label={button.label}
          title={button.label}
          onClick={() => {
            button.onClick();
            focusRailContentAfterExpansion(button.focusTarget);
          }}
          className={`m-0.5 flex h-11 w-11 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            button.active
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          }`}
        >
          {button.icon}
        </button>
      ))}
    </aside>
  );
}

function focusRailContentAfterExpansion(target: "outline" | "details") {
  window.requestAnimationFrame(() => {
    const selector =
      target === "details"
        ? '[role="tab"][aria-selected="true"]'
        : '[data-outline-id], [aria-label="Collapse document context rail"]';
    document.querySelector<HTMLElement>(selector)?.focus();
  });
}

function EditorContextContent(props: {
  p: EditorShellFlatContract;
  closeAfterNavigate: boolean;
}) {
  const { p } = props;
  const detailsActive = p.contextRail.view === "details";
  return (
    <>
      <div
        hidden={!detailsActive}
        className="min-h-0 flex-1 flex-col bg-background"
        style={{ display: detailsActive ? "flex" : "none" }}
      >
        <DetailsPanelContent
          key={p.contextRail.scopeKey}
          active={detailsActive}
          activeTab={p.contextRail.detailsTab}
          onTabChange={p.contextRail.setDetailsTab}
          onShowDeleteConfirm={() => p.setShowDeleteConfirm(true)}
          onExportMarkdown={p.handleExportMarkdown}
          onExportConfluenceHTML={() => void p.handleExportConfluenceHTML()}
          documentActions={p.documentActions}
          onRevert={p.handleRevert}
          shareUrl={p.share.shareUrl}
          activeShare={p.share.activeShare}
          copied={p.share.copied}
          onShare={p.share.handleShare}
          onLoadShare={p.share.loadShare}
          onRevokeShare={p.share.handleRevokeShare}
          onCopyLink={p.share.handleCopyLink}
          onUpdateShareConfig={p.share.updateShareConfig}
          onError={(message) =>
            p.toast({ description: message, variant: "error" })
          }
        />
      </div>
      <div
        hidden={detailsActive}
        className="min-h-0 flex-1 flex-col bg-background"
        style={{ display: detailsActive ? "none" : "flex" }}
      >
        <OutlineContent
          p={p}
          closeAfterNavigate={props.closeAfterNavigate}
        />
      </div>
    </>
  );
}

function OutlineContent(props: {
  p: EditorShellFlatContract;
  closeAfterNavigate: boolean;
}) {
  const { p } = props;
  const isDesktop = useDesktopViewport();
  return (
    <div className="min-h-0 flex-1 bg-background">
      <OutlinePanel
        entries={p.outline}
        activeId={p.scrollSync.activeTocId}
        onSelect={(entry) => {
          const effectiveMode =
            isDesktop || p.viewMode === "preview" ? p.viewMode : "edit";
          if (effectiveMode === "edit") {
            p.scrollSync.scrollEditorToSourceLine(entry.sourceLine, entry.id);
          } else {
            p.scrollSync.scrollPreviewToHeading(entry.id);
          }
          if (props.closeAfterNavigate) {
            p.contextRail.closeDrawer();
          }
        }}
      />
    </div>
  );
}

function OutlinePanel(props: {
  entries: readonly OutlineEntry[];
  activeId: string | null;
  onSelect: (entry: OutlineEntry) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = listRef.current;
    if (!container || !props.activeId) return;
    const active = Array.from(
      container.querySelectorAll<HTMLElement>("[data-outline-id]"),
    ).find((candidate) => candidate.dataset.outlineId === props.activeId);
    if (!active) return;
    const margin = 12;
    const containerRect = container.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    if (activeRect.top < containerRect.top + margin) {
      container.scrollTop += activeRect.top - containerRect.top - margin;
    } else if (activeRect.bottom > containerRect.bottom - margin) {
      container.scrollTop += activeRect.bottom - containerRect.bottom + margin;
    }
  }, [props.activeId]);

  if (props.entries.length === 0) {
    return (
      <EmptyPanel>
        Add a Markdown heading to navigate this note from here.
      </EmptyPanel>
    );
  }
  return (
    <div ref={listRef} className="custom-scrollbar h-full overflow-y-auto p-3">
      <nav aria-label="Note outline" className="space-y-0.5">
        {props.entries.map((entry) => {
          const active = entry.id === props.activeId;
          const indent = Math.min(36, Math.max(0, entry.level - 1) * 12);
          return (
            <button
              key={`${entry.id}-${entry.sourceLine}`}
              type="button"
              data-outline-id={entry.id}
              aria-current={active ? "location" : undefined}
              title={entry.text}
              onClick={() => props.onSelect(entry)}
              className={`flex min-h-8 w-full items-center rounded-md border-l-2 pr-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                active
                  ? "border-primary bg-accent font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              }`}
              style={{ paddingLeft: `${8 + indent}px` }}
            >
              <span className="truncate">{entry.text}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full min-h-40 items-center justify-center p-6 text-center text-xs leading-relaxed text-muted-foreground">
      {children}
    </div>
  );
}
