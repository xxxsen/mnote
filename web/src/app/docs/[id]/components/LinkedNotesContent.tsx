"use client";

import { useId, type KeyboardEvent } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { formatDate } from "@/lib/utils";
import type { DocumentLinksController } from "../hooks/useDocumentLinks";
import type {
  DocumentLinkDirection,
  LinkedDocument,
} from "../types";

type LinkedNotesContentProps = {
  links: DocumentLinksController;
  onPreview: (documentID: string) => void;
  onOpen: (documentID: string) => void;
};

const tabs: Array<{
  id: DocumentLinkDirection;
  label: string;
}> = [
  { id: "incoming", label: "Incoming" },
  { id: "outgoing", label: "Outgoing" },
];

export function LinkedNotesContent(props: LinkedNotesContentProps) {
  const tabsID = useId().replaceAll(":", "");
  const { links } = props;
  const handleTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    current: DocumentLinkDirection,
  ) => {
    let next: DocumentLinkDirection | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      next =
        event.key === "ArrowLeft"
          ? current === "incoming"
            ? "outgoing"
            : "incoming"
          : current === "outgoing"
            ? "incoming"
            : "outgoing";
    } else if (event.key === "Home") {
      next = "incoming";
    } else if (event.key === "End") {
      next = "outgoing";
    }
    if (!next) return;
    event.preventDefault();
    links.setActiveTab(next);
    window.requestAnimationFrame(() => {
      document.getElementById(`${tabsID}-${next}-tab`)?.focus();
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="tablist"
        aria-label="Linked note direction"
        className="grid grid-cols-2 border-b border-border bg-muted/20"
      >
        {tabs.map((tab) => {
          const count = links.counts?.[tab.id];
          return (
            <button
              key={tab.id}
              id={`${tabsID}-${tab.id}-tab`}
              type="button"
              role="tab"
              aria-selected={links.activeTab === tab.id}
              aria-controls={`${tabsID}-${tab.id}-panel`}
              tabIndex={links.activeTab === tab.id ? 0 : -1}
              onClick={() => links.setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
              className={`min-h-10 border-b-2 px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                links.activeTab === tab.id
                  ? "border-primary bg-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              {tab.label}
              {count !== undefined ? ` ${count}` : ""}
            </button>
          );
        })}
      </div>
      {links.hasDraftLinkChanges ? (
        <div
          role="status"
          className="border-b border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
        >
          Save this note to update linked notes.
        </div>
      ) : null}
      {links.refreshing ? (
        <div
          role="status"
          className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs text-muted-foreground"
        >
          <RefreshCw
            aria-hidden="true"
            className="h-3 w-3 animate-spin motion-reduce:animate-none"
          />
          Refreshing…
        </div>
      ) : links.refreshError ? (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          <span>Could not refresh.</span>
          <button
            type="button"
            className="font-semibold underline underline-offset-2"
            onClick={() => void links.retry()}
          >
            Retry
          </button>
        </div>
      ) : null}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`${tabsID}-${tab.id}-panel`}
          role="tabpanel"
          aria-labelledby={`${tabsID}-${tab.id}-tab`}
          hidden={links.activeTab !== tab.id}
          className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3"
          style={{ display: links.activeTab === tab.id ? "block" : "none" }}
        >
          <LinkedNotesPanel
            direction={tab.id}
            links={links}
            onPreview={props.onPreview}
            onOpen={props.onOpen}
          />
        </div>
      ))}
    </div>
  );
}

function LinkedNotesPanel(props: {
  direction: DocumentLinkDirection;
  links: DocumentLinksController;
  onPreview: (documentID: string) => void;
  onOpen: (documentID: string) => void;
}) {
  const { direction, links } = props;
  if (links.status === "idle" || links.status === "loading") {
    return (
      <div
        role="status"
        className="flex min-h-40 items-center justify-center text-center text-sm text-muted-foreground"
      >
        Loading linked notes…
      </div>
    );
  }
  if (links.status === "error") {
    return (
      <div
        role="alert"
        className="flex min-h-40 flex-col items-center justify-center gap-3 text-center"
      >
        <p className="text-sm font-semibold">Linked notes unavailable</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void links.retry()}
        >
          Retry
        </Button>
      </div>
    );
  }
  const items =
    direction === "incoming" ? links.incoming : links.outgoing;
  const nextCursor =
    direction === "incoming"
      ? links.incomingNextCursor
      : links.outgoingNextCursor;
  if (items.length === 0) {
    return (
      <div className="flex min-h-40 items-center justify-center px-3 text-center text-sm leading-relaxed text-muted-foreground">
        {direction === "incoming"
          ? "No notes link to this note yet."
          : "Type [[ in the editor to link another note."}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {items.map((document) => (
        <LinkedNoteRow
          key={document.id}
          document={document}
          onPreview={props.onPreview}
          onOpen={props.onOpen}
        />
      ))}
      {nextCursor || links.loadMoreError === direction ? (
        <div className="pt-1 text-center">
          {links.loadMoreError === direction ? (
            <div
              role="alert"
              className="flex items-center justify-center gap-2 text-xs text-destructive"
            >
              <span>Could not load more.</span>
              <button
                type="button"
                className="font-semibold underline underline-offset-2"
                onClick={() => void links.loadMore(direction)}
              >
                Retry
              </button>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={links.loadingMore !== null}
              onClick={() => void links.loadMore(direction)}
            >
              {links.loadingMore === direction ? "Loading…" : "Load more"}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function LinkedNoteRow(props: {
  document: LinkedDocument;
  onPreview: (documentID: string) => void;
  onOpen: (documentID: string) => void;
}) {
  const title = props.document.title || "Untitled";
  return (
    <div className="grid min-h-12 grid-cols-[minmax(0,1fr)_2.5rem] items-stretch overflow-hidden rounded-lg border border-border bg-background">
      <button
        type="button"
        aria-label={`Preview ${title}`}
        className="min-w-0 p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        onClick={() => props.onPreview(props.document.id)}
      >
        <span className="line-clamp-2 block break-words text-sm font-semibold leading-snug">
          {title}
        </span>
        <span className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{formatDate(props.document.mtime)}</span>
          {props.document.mutual ? (
            <span className="rounded border border-border px-1.5 py-0.5 font-medium text-foreground">
              Mutual
            </span>
          ) : null}
        </span>
      </button>
      <IconButton
        type="button"
        label={`Open ${title}`}
        variant="ghost"
        className="m-1 h-10 w-8 self-center"
        onClick={() => props.onOpen(props.document.id)}
      >
        <ExternalLink aria-hidden="true" className="h-4 w-4" />
      </IconButton>
    </div>
  );
}
