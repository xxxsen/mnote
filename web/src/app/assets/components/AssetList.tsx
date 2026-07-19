"use client";

import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageState } from "@/components/ui/page-state";
import type { Asset } from "@/types";

import { formatAssetSize } from "../helpers";
import { AssetPreview } from "./AssetPreview";

type AssetListProps = {
  assets: Asset[];
  selectedID: string;
  search: string;
  debouncedSearch: string;
  loading: boolean;
  loadingMore: boolean;
  initialError: boolean;
  loadMoreError: boolean;
  hasMore: boolean;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onSelect: (id: string) => void;
  onRetryInitial: () => void;
  onLoadMore: () => void;
  onBackToNotes: () => void;
};

export function AssetList({
  assets,
  selectedID,
  search,
  debouncedSearch,
  loading,
  loadingMore,
  initialError,
  loadMoreError,
  hasMore,
  onSearchChange,
  onClearSearch,
  onSelect,
  onRetryInitial,
  onLoadMore,
  onBackToNotes,
}: AssetListProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            aria-label="Search assets"
            placeholder="Search assets"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {initialError ? (
          <PageState
            kind="error"
            title="Could not load assets"
            description="Your search is preserved. Try loading the asset library again."
            actionLabel="Retry"
            onAction={onRetryInitial}
          />
        ) : loading ? (
          <PageState compact kind="loading" title="Loading assets" />
        ) : assets.length === 0 ? (
          <PageState
            kind="empty"
            title={debouncedSearch ? `No assets match “${debouncedSearch}”` : "No assets yet"}
            description={debouncedSearch
              ? "Clear the search to see all uploaded files."
              : "Assets are created when files are uploaded from the editor."}
            actionLabel={debouncedSearch ? "Clear search" : "Back to notes"}
            onAction={debouncedSearch ? onClearSearch : onBackToNotes}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
            {assets.map((asset) => {
              const selected = asset.id === selectedID;
              return (
                <button
                  key={asset.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelect(asset.id)}
                  className={`min-w-0 rounded-md border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-foreground/40"
                  }`}
                >
                  <AssetPreview key={`${asset.id}-${asset.url}`} asset={asset} compact />
                  <p className="mt-2 truncate text-sm font-medium" title={asset.name}>{asset.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {formatAssetSize(asset.size)} · {asset.ref_count} reference{asset.ref_count === 1 ? "" : "s"}
                  </p>
                </button>
              );
            })}
          </div>
        )}
        {loadingMore ? (
          <p role="status" className="py-4 text-center text-sm text-muted-foreground">Loading more assets…</p>
        ) : null}
        {loadMoreError ? (
          <PageState
            compact
            kind="error"
            title="Could not load more assets"
            description="The assets already shown are still available."
            actionLabel="Retry"
            onAction={onLoadMore}
          />
        ) : null}
        {hasMore && !loading && !initialError && !loadMoreError ? (
          <div className="flex justify-center py-4">
            <Button type="button" variant="outline" onClick={onLoadMore} disabled={loadingMore}>
              Load more
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
