"use client";

import { Search, Trash2 } from "lucide-react";
import type { UIEvent } from "react";

import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { PageState } from "@/components/ui/page-state";
import type { TemplateMeta } from "@/types";
import { formatTemplateMtime } from "../utils";

export function TemplateList({
  templates,
  templatesTotal,
  loading,
  loadingMore,
  listError,
  loadMoreError,
  selectedID,
  search,
  setSearch,
  onSelect,
  onDelete,
  onRetry,
  onRetryLoadMore,
  onScroll,
}: {
  templates: TemplateMeta[];
  templatesTotal: number;
  loading: boolean;
  loadingMore: boolean;
  listError: string | null;
  loadMoreError: string | null;
  selectedID: string;
  search: string;
  setSearch: (value: string) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onRetry: () => void;
  onRetryLoadMore: () => void;
  onScroll: (event: UIEvent<HTMLDivElement>) => void;
}) {
  return (
    <>
      <div className="border-b border-border p-3">
        <div className="mb-2 text-xs text-muted-foreground">Templates ({templatesTotal})</div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            aria-label="Search templates"
            className="pl-9"
            placeholder="Search templates"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2" onScroll={onScroll}>
        {loading ? (
          <PageState kind="loading" title="Loading templates…" compact />
        ) : listError ? (
          <PageState kind="error" title="Templates could not be loaded" description={listError} actionLabel="Retry" onAction={onRetry} compact />
        ) : templates.length === 0 ? (
          <PageState
            kind="empty"
            title={search ? "No matching templates" : "No templates yet"}
            description={search ? `Nothing matched “${search}”.` : "Create a template to reuse note structures."}
            actionLabel={search ? "Clear search" : undefined}
            onAction={search ? () => setSearch("") : undefined}
            compact
          />
        ) : (
          <ul className="space-y-1">
            {templates.map((item) => (
              <li
                key={item.id}
                className={`flex items-center gap-1 rounded-lg border p-1 ${
                  item.id === selectedID ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted"
                }`}
              >
                <button
                  type="button"
                  aria-current={item.id === selectedID ? "true" : undefined}
                  onClick={() => onSelect(item.id)}
                  className="min-h-16 min-w-0 flex-1 rounded-md px-2 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="block truncate text-sm font-semibold">{item.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.description || "No description"}</span>
                  <span className="block truncate text-xs text-muted-foreground">Saved {formatTemplateMtime(item.mtime)}</span>
                </button>
                <IconButton
                  label={`Delete ${item.name}`}
                  variant="ghost"
                  className="shrink-0 text-destructive"
                  onClick={() => onDelete(item.id, item.name)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
        {loadingMore ? <div role="status" className="p-3 text-center text-xs text-muted-foreground">Loading more…</div> : null}
        {loadMoreError ? (
          <div role="alert" className="m-2 flex items-center justify-between gap-2 rounded-md border border-destructive/30 p-2 text-xs text-destructive">
            <span>{loadMoreError}</span>
            <button type="button" className="font-medium underline" onClick={onRetryLoadMore}>Retry</button>
          </div>
        ) : null}
      </div>
    </>
  );
}
