"use client";

import { Search, Tag as TagIcon, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { AppPage } from "@/components/app-page";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogStatus,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageState } from "@/components/ui/page-state";
import { useToast } from "@/components/ui/toast";
import { getSafeInternalReturn } from "@/lib/navigation";

import { useTagsPage, type TagWithUsage } from "./hooks/useTagsPage";

function DeleteTagDialog({
  target,
  deleting,
  error,
  onClose,
  onConfirm,
}: {
  target: TagWithUsage | null;
  deleting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={Boolean(target)}
      role="alertdialog"
      title="Delete tag"
      description="This action removes the tag from every note and cannot be undone."
      size="sm"
      dismissPolicy="when-idle"
      busy={deleting}
      onClose={onClose}
    >
      <DialogHeader />
      <DialogBody className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Delete <span className="font-semibold text-foreground">#{target?.name}</span>? It will be
          removed from {target?.usageCount ?? 0} note{target?.usageCount === 1 ? "" : "s"}.
        </p>
        {deleting ? <DialogStatus variant="loading">Deleting tag…</DialogStatus> : null}
        {error ? <DialogStatus variant="error">{error}</DialogStatus> : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" className="h-11 w-full sm:w-auto" onClick={onClose} disabled={deleting}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          className="h-11 w-full sm:w-auto"
          onClick={onConfirm}
          isLoading={deleting}
        >
          Delete tag
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function TagRow({
  tag,
  onDelete,
}: {
  tag: TagWithUsage;
  onDelete: (tag: TagWithUsage) => void;
}) {
  return (
    <li className="flex min-h-16 items-center justify-between gap-3 border-b border-border px-3 py-3 last:border-b-0 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
          <TagIcon className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">#{tag.name}</p>
          <p className="text-xs text-muted-foreground">
            Used in {tag.usageCount} note{tag.usageCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        className="h-11 shrink-0 gap-2 px-3 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-10"
        onClick={() => onDelete(tag)}
        aria-label={`Delete ${tag.name}`}
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Delete</span>
      </Button>
    </li>
  );
}

export default function TagsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const tags = useTagsPage(toast);
  const returnTo = getSafeInternalReturn(searchParams.get("return"));

  return (
    <AppPage
      title="Tags"
      description="Review usage and remove tags from your notes."
      onBack={() => router.push(returnTo)}
    >
      <div className="relative mb-5">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          aria-label="Search tags"
          placeholder="Search tags"
          value={tags.search}
          onChange={(event) => tags.setSearch(event.target.value)}
          className="pl-9"
        />
      </div>

      {tags.initialError ? (
        <PageState
          kind="error"
          title="Could not load tags"
          description="Your search is preserved. Try loading the tag list again."
          actionLabel="Retry"
          onAction={tags.retryInitial}
        />
      ) : tags.loading ? (
        <PageState kind="loading" title="Loading tags" description="Preparing tag usage information." />
      ) : tags.tags.length === 0 ? (
        <PageState
          kind="empty"
          title={tags.debouncedSearch ? `No tags match “${tags.debouncedSearch}”` : "No tags yet"}
          description={tags.debouncedSearch
            ? "Clear the search to see every tag."
            : "Tags appear here after they are added to a note."}
          actionLabel={tags.debouncedSearch ? "Clear search" : undefined}
          onAction={tags.debouncedSearch ? tags.clearSearch : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-card">
          <ul>
            {tags.tags.map((tag) => (
              <TagRow key={tag.id} tag={tag} onDelete={tags.requestDelete} />
            ))}
          </ul>
        </div>
      )}

      {tags.loadingMore ? (
        <p role="status" className="mt-4 text-center text-sm text-muted-foreground">Loading more tags…</p>
      ) : null}
      {tags.loadMoreError ? (
        <PageState
          compact
          kind="error"
          title="Could not load more tags"
          description="The tags already shown are still available."
          actionLabel="Retry"
          onAction={tags.loadMore}
        />
      ) : null}
      {tags.hasMore && !tags.loading && !tags.initialError && !tags.loadMoreError ? (
        <div className="mt-5 flex justify-center">
          <Button type="button" variant="outline" onClick={tags.loadMore} disabled={tags.loadingMore}>
            Load more
          </Button>
        </div>
      ) : null}

      <DeleteTagDialog
        target={tags.deleteTarget}
        deleting={tags.deleting}
        error={tags.deleteError}
        onClose={tags.closeDeleteDialog}
        onConfirm={() => void tags.confirmDelete()}
      />
    </AppPage>
  );
}
