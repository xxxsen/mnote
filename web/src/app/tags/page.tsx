"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Search, Tag as TagIcon, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogStatus,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

const loadingPlaceholders = ["p0", "p1", "p2", "p3", "p4"];

type TagWithUsage = {
  id: string;
  name: string;
  usageCount: number;
};

export default function TagsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [tags, setTags] = useState<TagWithUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const fetchingRef = useRef(false);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TagWithUsage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deletingRef = useRef(false);
  const returnTo = getSafeReturn(searchParams.get("return"));

  const fetchData = useCallback(async (nextOffset: number, append: boolean) => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    fetchingRef.current = true;
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: "10",
        offset: String(nextOffset),
      });
      if (search.trim()) params.set("q", search.trim());
      const items = await apiFetch<{ id: string; name: string; count: number }[]>(
        `/tags/summary?${params.toString()}`,
        { signal: controller.signal },
      );
      const next = items.map((tag) => ({
        id: tag.id,
        name: tag.name,
        usageCount: tag.count,
      }));
      setTags((previous) => (append ? [...previous, ...next] : next));
      setHasMore(items.length === 10);
      setOffset(nextOffset + items.length);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast({
        description: error instanceof Error ? error.message : "Failed to load tags data",
        variant: "error",
      });
    } finally {
      if (fetchAbortRef.current === controller) {
        fetchAbortRef.current = null;
        fetchingRef.current = false;
      }
      if (!controller.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [search, toast]);

  useEffect(() => {
    setOffset(0);
    setHasMore(true);
    void fetchData(0, false);
    return () => fetchAbortRef.current?.abort();
  }, [fetchData]);

  const handleBack = useCallback(() => {
    if (returnTo) {
      router.push(returnTo);
    } else if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/docs");
    }
  }, [returnTo, router]);

  const requestDelete = (tag: TagWithUsage) => {
    setDeleteError(null);
    setDeleteTarget(tag);
  };

  const closeDeleteDialog = () => {
    if (deletingRef.current) return;
    setDeleteError(null);
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiFetch(`/tags/${deleteTarget.id}`, { method: "DELETE" });
      setTags((previous) => previous.filter((tag) => tag.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete tag";
      setDeleteError(message);
      toast({ description: message, variant: "error" });
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="z-20 flex h-14 items-center gap-4 border-b border-border bg-background px-4">
        <Button variant="ghost" size="icon" onClick={handleBack} aria-label="Back">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </Button>
        <div className="font-mono text-lg font-bold">Tag Management</div>
      </header>
      <div
        className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto p-4 md:p-8"
        onScroll={(event) => {
          const element = event.currentTarget;
          if (fetchingRef.current || loading || loadingMore || !hasMore) return;
          if (element.scrollTop + element.clientHeight >= element.scrollHeight - 120) {
            void fetchData(offset, true);
          }
        }}
      >
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Search tags..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>
        {loading ? (
          <div className="flex flex-col gap-2">
            {loadingPlaceholders.map((key) => (
              <div key={key} className="h-12 animate-pulse rounded bg-muted/50" />
            ))}
          </div>
        ) : tags.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            {search ? "No tags match your search." : "No tags found."}
          </div>
        ) : (
          <div className="grid gap-2">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-3 transition-colors hover:border-foreground/50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <TagIcon className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-mono text-sm font-bold">#{tag.name}</span>
                    <span className="text-xs text-muted-foreground">
                      Used in {tag.usageCount} note{tag.usageCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => requestDelete(tag)}
                  className="min-h-11 rounded-xl"
                  aria-label={`Delete ${tag.name}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  <span className="ml-2 hidden sm:inline">Delete</span>
                </Button>
              </div>
            ))}
          </div>
        )}
        {loadingMore ? (
          <div className="mt-4 text-center text-xs text-muted-foreground">Loading more...</div>
        ) : null}
      </div>
      <DeleteTagDialog
        target={deleteTarget}
        deleting={deleting}
        error={deleteError}
        onClose={closeDeleteDialog}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

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
        <p className="text-sm text-slate-700">
          Delete <span className="font-mono font-semibold text-slate-950">#{target?.name}</span>?
          It will be removed from {target?.usageCount ?? 0} note
          {target?.usageCount === 1 ? "" : "s"}.
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

function getSafeReturn(value: string | null): string | null {
  if (!value?.startsWith("/") || value.startsWith("//")) return null;
  return value;
}
