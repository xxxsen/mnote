"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ToastInput } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api";

export type TagWithUsage = {
  id: string;
  name: string;
  usageCount: number;
};

type Toast = (input: ToastInput) => void;

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function useTagCatalog() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tags, setTags] = useState<TagWithUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialError, setInitialError] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const requestIDRef = useRef(0);
  const fetchingRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (nextOffset: number, append: boolean) => {
    if (fetchingRef.current && append) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    const requestID = ++requestIDRef.current;
    abortRef.current = controller;
    fetchingRef.current = true;
    if (append) {
      setLoadingMore(true);
      setLoadMoreError(false);
    } else {
      setLoading(true);
      setInitialError(false);
    }

    try {
      const params = new URLSearchParams({ limit: "10", offset: String(nextOffset) });
      if (debouncedSearch) params.set("q", debouncedSearch);
      const items = await apiFetch<{ id: string; name: string; count: number }[]>(
        `/tags/summary?${params.toString()}`,
        { signal: controller.signal },
      );
      if (requestIDRef.current !== requestID) return;
      const next = items.map((tag) => ({
        id: tag.id,
        name: tag.name,
        usageCount: tag.count,
      }));
      setTags((previous) => {
        if (!append) return next;
        const existing = new Set(previous.map((tag) => tag.id));
        return [...previous, ...next.filter((tag) => !existing.has(tag.id))];
      });
      setHasMore(items.length === 10);
      setOffset(nextOffset + items.length);
    } catch (error) {
      if (isAbortError(error) || requestIDRef.current !== requestID) return;
      if (append) setLoadMoreError(true);
      else setInitialError(true);
    } finally {
      if (requestIDRef.current === requestID) {
        abortRef.current = null;
        fetchingRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [debouncedSearch]);

  useEffect(() => {
    void load(0, false);
    return () => abortRef.current?.abort();
  }, [load]);

  const retryInitial = useCallback(() => void load(0, false), [load]);
  const loadMore = useCallback(() => void load(offset, true), [load, offset]);
  const clearSearch = useCallback(() => setSearch(""), []);

  return {
    tags,
    setTags,
    search,
    setSearch,
    debouncedSearch,
    loading,
    loadingMore,
    initialError,
    loadMoreError,
    hasMore,
    retryInitial,
    loadMore,
    clearSearch,
  };
}

function useTagDeletion(
  setTags: React.Dispatch<React.SetStateAction<TagWithUsage[]>>,
  toast: Toast,
) {
  const [deleteTarget, setDeleteTarget] = useState<TagWithUsage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deletingRef = useRef(false);

  const requestDelete = useCallback((tag: TagWithUsage) => {
    setDeleteError(null);
    setDeleteTarget(tag);
  }, []);
  const closeDeleteDialog = useCallback(() => {
    if (deletingRef.current) return;
    setDeleteError(null);
    setDeleteTarget(null);
  }, []);
  const confirmDelete = useCallback(async () => {
    if (!deleteTarget || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiFetch(`/tags/${deleteTarget.id}`, { method: "DELETE" });
      setTags((previous) => previous.filter((tag) => tag.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast({ description: `#${deleteTarget.name} was deleted.`, variant: "success" });
    } catch {
      const message = "The tag could not be deleted. Try again.";
      setDeleteError(message);
      toast({ description: message, variant: "error" });
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }, [deleteTarget, setTags, toast]);

  return {
    deleteTarget,
    deleting,
    deleteError,
    requestDelete,
    closeDeleteDialog,
    confirmDelete,
  };
}

export function useTagsPage(toast: Toast) {
  const catalog = useTagCatalog();
  const deletion = useTagDeletion(catalog.setTags, toast);
  return { ...catalog, ...deletion };
}
