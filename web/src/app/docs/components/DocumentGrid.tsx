"use client";

import Link from "next/link";
import { Copy, Loader2, Pin, Search, Star, X } from "lucide-react";

import { PageState } from "@/components/ui/page-state";
import type { Tag } from "@/types";

import type { DocumentWithTags } from "../types";
import { formatRelativeTime } from "../utils";

export function getDocumentExcerpt(doc: DocumentWithTags) {
  const source = (doc.content || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return source.length > 120 ? `${source.slice(0, 117).trimEnd()}…` : source;
}

function SemanticSearchCard({
  doc,
  tagIndex,
}: {
  doc: DocumentWithTags;
  tagIndex: Partial<Record<string, Tag>>;
}) {
  const docTags = (doc.tag_ids || [])
    .map((id) => tagIndex[id])
    .filter((tag): tag is Tag => Boolean(tag));
  return (
    <article className="relative min-h-40 overflow-hidden rounded-md border border-info/30 bg-info/5">
      <Link
        href={`/docs/${doc.id}`}
        className="flex min-h-40 flex-col p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div className="flex items-center gap-2 text-xs font-medium text-info">
          <Search className="h-4 w-4" aria-hidden="true" />
          Relevance {Math.round(Math.max(-1, Math.min(1, doc.score || 0)) * 100)}
          {doc.match_type ? ` · ${doc.match_type}` : ""}
        </div>
        <h3 className="mt-3 line-clamp-2 text-base font-semibold">{doc.title || "Untitled"}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">
          {doc.matched_excerpt || getDocumentExcerpt(doc) || "No preview available"}
        </p>
        {docTags.length > 0 ? (
          <div className="mt-auto flex flex-wrap gap-1 pt-3">
            {docTags.map((tag) => (
              <span key={tag.id} className="rounded-full bg-info/10 px-2 py-0.5 text-xs text-info">
                #{tag.name}
              </span>
            ))}
          </div>
        ) : null}
      </Link>
    </article>
  );
}

type DocumentCardProps = {
  doc: DocumentWithTags;
  tagIndex: Partial<Record<string, Tag>>;
  showShared: boolean;
  pendingActions: ReadonlySet<string>;
  onPinToggle: (doc: DocumentWithTags) => void;
  onStarToggle: (doc: DocumentWithTags) => void;
  onCopyShare: (token: string) => void;
};

function DocumentActions({
  doc,
  showShared,
  pendingActions,
  onPinToggle,
  onStarToggle,
  onCopyShare,
}: Omit<DocumentCardProps, "tagIndex">) {
  const title = doc.title || "Untitled";
  if (showShared) {
    return (
      <button
        type="button"
        aria-label={`Copy share link for ${title}`}
        title="Copy share link"
        disabled={!doc.share_token}
        onClick={() => {
          if (doc.share_token) onCopyShare(doc.share_token);
        }}
        className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 lg:h-9 lg:w-9"
      >
        <Copy className="h-4 w-4" aria-hidden="true" />
      </button>
    );
  }

  const pinPending = pendingActions.has(`pin:${doc.id}`);
  const starPending = pendingActions.has(`star:${doc.id}`);
  return (
    <>
      <button
        type="button"
        aria-label={`${doc.starred ? "Unstar" : "Star"} ${title}`}
        title={doc.starred ? "Unstar note" : "Star note"}
        aria-busy={starPending || undefined}
        disabled={starPending}
        onClick={() => onStarToggle(doc)}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-md border border-border bg-background shadow-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-9 lg:w-9 ${
          doc.starred ? "text-warning" : "text-muted-foreground"
        }`}
      >
        {starPending
          ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          : <Star className={`h-4 w-4 ${doc.starred ? "fill-current" : ""}`} aria-hidden="true" />}
      </button>
      <button
        type="button"
        aria-label={`${doc.pinned ? "Unpin" : "Pin"} ${title}`}
        title={doc.pinned ? "Unpin note" : "Pin note"}
        aria-busy={pinPending || undefined}
        disabled={pinPending}
        onClick={() => onPinToggle(doc)}
        className={`inline-flex h-11 w-11 items-center justify-center rounded-md border border-border bg-background shadow-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-9 lg:w-9 ${
          doc.pinned ? "text-primary" : "text-muted-foreground"
        }`}
      >
        {pinPending
          ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          : <Pin className={`h-4 w-4 ${doc.pinned ? "fill-current" : ""}`} aria-hidden="true" />}
      </button>
    </>
  );
}

function DocumentCard({
  doc,
  tagIndex,
  showShared,
  pendingActions,
  onPinToggle,
  onStarToggle,
  onCopyShare,
}: DocumentCardProps) {
  const docTags = (doc.tag_ids || [])
    .map((id) => tagIndex[id])
    .filter((tag): tag is Tag => Boolean(tag));
  const excerpt = getDocumentExcerpt(doc);
  const title = doc.title || "Untitled";

  return (
    <article className="group relative min-h-[156px] overflow-hidden rounded-md border border-border bg-card transition-colors hover:border-foreground/50">
      <Link
        href={`/docs/${doc.id}`}
        className="flex min-h-[156px] flex-col p-4 pr-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <h3 className="line-clamp-2 text-base font-semibold leading-6" title={title}>
          {title}
        </h3>
        <p className="mt-2 line-clamp-2 text-sm leading-5 text-muted-foreground">
          {excerpt || "No preview available"}
        </p>
        <div className="mt-auto pt-3">
          <p className="text-xs text-muted-foreground">Updated {formatRelativeTime(doc.mtime)}</p>
          {docTags.length > 0 ? (
            <div className="mt-2 flex max-h-12 flex-wrap gap-1 overflow-hidden">
              {docTags.map((tag) => (
                <span
                  key={tag.id}
                  title={tag.name}
                  className="max-w-32 truncate rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                >
                  #{tag.name}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </Link>

      <div className="absolute right-2 top-2 flex gap-1 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
        <DocumentActions
          doc={doc}
          showShared={showShared}
          pendingActions={pendingActions}
          onPinToggle={onPinToggle}
          onStarToggle={onStarToggle}
          onCopyShare={onCopyShare}
        />
      </div>
    </article>
  );
}

export interface DocumentGridProps {
  docs: DocumentWithTags[];
  semanticSearchDocs: DocumentWithTags[];
  semanticSearching: boolean;
  semanticSearchStatus: "idle" | "searching" | "ready" | "unavailable";
  loading: boolean;
  loadingMore: boolean;
  initialError: boolean;
  loadMoreError: boolean;
  hasMore: boolean;
  search: string;
  selectedTag: string;
  showStarred: boolean;
  showShared: boolean;
  tagIndex: Partial<Record<string, Tag>>;
  pendingActions: ReadonlySet<string>;
  loadMoreRef: React.RefObject<HTMLDivElement | null>;
  onCreate: () => void;
  onClearSearch: () => void;
  onClearFilter: () => void;
  onRetryInitial: () => void;
  onRetryLoadMore: () => void;
  onPinToggle: (doc: DocumentWithTags) => void;
  onStarToggle: (doc: DocumentWithTags) => void;
  onCopyShare: (token: string) => void;
}

function FilterStatus({
  search,
  selectedTag,
  showStarred,
  showShared,
  tagIndex,
  onClearSearch,
  onClearFilter,
}: Pick<
  DocumentGridProps,
  "search" | "selectedTag" | "showStarred" | "showShared" | "tagIndex" | "onClearSearch" | "onClearFilter"
>) {
  const filter = selectedTag
    ? `#${tagIndex[selectedTag]?.name ?? "Tag"}`
    : showStarred
      ? "Starred"
      : showShared
        ? "Shared"
        : "";
  if (!search && !filter) return null;
  return (
    <div className="mb-4 flex flex-wrap gap-2" aria-label="Active filters">
      {filter ? (
        <button
          type="button"
          onClick={onClearFilter}
          className="inline-flex min-h-9 items-center gap-1 rounded-full bg-primary/10 px-3 text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {filter}
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">Clear filter</span>
        </button>
      ) : null}
      {search ? (
        <button
          type="button"
          onClick={onClearSearch}
          className="inline-flex min-h-9 items-center gap-1 rounded-full bg-muted px-3 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Search: {search}
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">Clear search</span>
        </button>
      ) : null}
    </div>
  );
}

function SemanticResults({
  docs,
  searching,
  status,
  tagIndex,
}: {
  docs: DocumentWithTags[];
  searching: boolean;
  status: DocumentGridProps["semanticSearchStatus"];
  tagIndex: Partial<Record<string, Tag>>;
}) {
  if (status === "idle") return null;
  if (status === "unavailable") {
    return (
      <p role="status" className="mb-6 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        Semantic search is unavailable. Keyword results remain available.
      </p>
    );
  }
  if (status === "searching" && docs.length === 0) {
    return (
      <p role="status" className="mb-6 text-sm text-muted-foreground">
        Searching indexed content…
      </p>
    );
  }
  if (status === "ready" && docs.length === 0) {
    return (
      <p role="status" className="mb-6 text-sm text-muted-foreground">
        No semantic matches. Keyword results are shown below.
      </p>
    );
  }
  return (
    <section aria-labelledby="semantic-results-heading" className="mb-8">
      <div className="mb-4 flex items-center gap-2">
        <Search className="h-4 w-4 text-info" aria-hidden="true" />
        <h2 id="semantic-results-heading" className="text-sm font-semibold">Semantic results</h2>
        {searching ? <span role="status" className="text-xs text-muted-foreground">Searching…</span> : null}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {docs.map((doc) => <SemanticSearchCard key={`semantic-${doc.id}`} doc={doc} tagIndex={tagIndex} />)}
      </div>
    </section>
  );
}

function getEmptyTitle({
  search,
  showShared,
  showStarred,
  selectedTag,
}: Pick<DocumentGridProps, "search" | "showShared" | "showStarred" | "selectedTag">) {
  if (search) return `No notes match “${search}”`;
  if (showShared) return "No shared notes";
  if (showStarred) return "No starred notes";
  if (selectedTag) return "No notes use this tag";
  return "Create your first note";
}

type NotesContentProps = Omit<
  DocumentGridProps,
  "semanticSearchDocs" | "semanticSearching" | "semanticSearchStatus" |
  "onClearSearch" | "onClearFilter"
> & {
  hasFilter: boolean;
  emptyTitle: string;
  onClearAll: () => void;
};

function NotesContent({
  docs,
  loading,
  loadingMore,
  initialError,
  loadMoreError,
  hasMore,
  showShared,
  tagIndex,
  pendingActions,
  loadMoreRef,
  onCreate,
  onRetryInitial,
  onRetryLoadMore,
  onPinToggle,
  onStarToggle,
  onCopyShare,
  hasFilter,
  emptyTitle,
  onClearAll,
}: NotesContentProps) {
  if (initialError) {
    return (
      <PageState
        kind="error"
        title="Could not load notes"
        description="Your filters and search are preserved. Try loading the library again."
        actionLabel="Retry"
        onAction={onRetryInitial}
      />
    );
  }
  if (loading) {
    return <PageState kind="loading" title="Loading notes" description="Preparing your library." />;
  }
  if (docs.length === 0) {
    return (
      <PageState
        kind="empty"
        title={emptyTitle}
        description={hasFilter
          ? "Adjust the active search or filter to see other notes."
          : "Notes keep your writing, links, tags, and files together."}
        actionLabel={hasFilter ? "Clear filters" : "New note"}
        onAction={hasFilter ? onClearAll : onCreate}
      />
    );
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {docs.map((doc) => (
          <DocumentCard
            key={doc.id}
            doc={doc}
            tagIndex={tagIndex}
            showShared={showShared}
            pendingActions={pendingActions}
            onPinToggle={onPinToggle}
            onStarToggle={onStarToggle}
            onCopyShare={onCopyShare}
          />
        ))}
      </div>
      {loadingMore ? (
        <p role="status" className="text-center text-sm text-muted-foreground">Loading more notes…</p>
      ) : null}
      {loadMoreError ? (
        <PageState
          compact
          kind="error"
          title="Could not load more notes"
          description="The notes already shown are still available."
          actionLabel="Retry"
          onAction={onRetryLoadMore}
        />
      ) : null}
      {hasMore && !loadMoreError ? <div ref={loadMoreRef} className="h-6" /> : null}
    </div>
  );
}

export function DocumentGrid({
  docs,
  semanticSearchDocs,
  semanticSearching,
  semanticSearchStatus,
  loading,
  loadingMore,
  initialError,
  loadMoreError,
  hasMore,
  search,
  selectedTag,
  showStarred,
  showShared,
  tagIndex,
  pendingActions,
  loadMoreRef,
  onCreate,
  onClearSearch,
  onClearFilter,
  onRetryInitial,
  onRetryLoadMore,
  onPinToggle,
  onStarToggle,
  onCopyShare,
}: DocumentGridProps) {
  const hasFilter = Boolean(search || selectedTag || showShared || showStarred);
  const clearAll = () => {
    onClearSearch();
    onClearFilter();
  };
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
      <FilterStatus
        search={search}
        selectedTag={selectedTag}
        showStarred={showStarred}
        showShared={showShared}
        tagIndex={tagIndex}
        onClearSearch={onClearSearch}
        onClearFilter={onClearFilter}
      />
      <SemanticResults
        docs={semanticSearchDocs}
        searching={semanticSearching}
        status={semanticSearchStatus}
        tagIndex={tagIndex}
      />
      <NotesContent
        docs={docs}
        loading={loading}
        loadingMore={loadingMore}
        initialError={initialError}
        loadMoreError={loadMoreError}
        hasMore={hasMore}
        search={search}
        selectedTag={selectedTag}
        showStarred={showStarred}
        showShared={showShared}
        tagIndex={tagIndex}
        pendingActions={pendingActions}
        loadMoreRef={loadMoreRef}
        onCreate={onCreate}
        onRetryInitial={onRetryInitial}
        onRetryLoadMore={onRetryLoadMore}
        onPinToggle={onPinToggle}
        onStarToggle={onStarToggle}
        onCopyShare={onCopyShare}
        hasFilter={hasFilter}
        emptyTitle={getEmptyTitle({ search, selectedTag, showStarred, showShared })}
        onClearAll={clearAll}
      />
    </div>
  );
}
