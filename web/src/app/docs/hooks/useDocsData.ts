import { useCallback, useEffect, useRef, useState } from "react";
import type { Tag } from "@/types";
import { apiFetch } from "@/lib/api";
import type { ToastInput } from "@/components/ui/toast";
import type { DocumentWithTags, SharedItem } from "../types";
import { sortDocs, sortRecentDocs } from "../utils";

interface UseDocsDataDeps {
  search: string;
  selectedTag: string;
  showStarred: boolean;
  showShared: boolean;
  mergeTags: (items: Tag[]) => void;
  fetchTagsByIDs: (ids: string[]) => Promise<void>;
  tagIndexRef: { current: Partial<Record<string, Tag>> };
  toast: (input: ToastInput) => void;
}

const isAbortError = (e: unknown): boolean =>
  e instanceof DOMException && e.name === "AbortError";

function mapSharedItem(item: SharedItem): DocumentWithTags {
  return {
    id: item.id, user_id: "", title: item.title,
    content: item.content_preview,
    state: 1, pinned: 0, starred: 0,
    ctime: item.mtime, mtime: item.mtime,
    // Shared-document listings do not surface content_hash/revision because
    // the viewer never edits through this path. Defaults match a fresh doc.
    content_hash: "", content_mtime: 0, content_revision: 1,
    tags: [], tag_ids: item.tag_ids || [],
    share_token: item.token,
  };
}

function useDocumentActions({
  setDocs,
  onStarredChange,
  toast,
}: {
  setDocs: React.Dispatch<React.SetStateAction<DocumentWithTags[]>>;
  onStarredChange: () => Promise<void>;
  toast: (input: ToastInput) => void;
}) {
  const pendingRef = useRef(new Set<string>());
  const [pendingActions, setPendingActions] = useState<ReadonlySet<string>>(() => new Set());

  const runAction = useCallback(async (
    action: "pin" | "star",
    doc: DocumentWithTags,
  ) => {
    const key = `${action}:${doc.id}`;
    if (pendingRef.current.has(key)) return;
    pendingRef.current.add(key);
    setPendingActions(new Set(pendingRef.current));

    const previousValue = action === "pin" ? doc.pinned : doc.starred;
    const nextValue = previousValue ? 0 : 1;
    setDocs((previous) => {
      const updated = previous.map((item) => item.id === doc.id
        ? { ...item, [action === "pin" ? "pinned" : "starred"]: nextValue }
        : item);
      return action === "pin" ? sortDocs(updated) : updated;
    });

    try {
      await apiFetch(`/documents/${doc.id}/${action}`, {
        method: "PUT",
        body: JSON.stringify({ [action === "pin" ? "pinned" : "starred"]: nextValue === 1 }),
      });
      if (action === "star") void onStarredChange();
    } catch {
      setDocs((previous) => {
        const restored = previous.map((item) => item.id === doc.id
          ? { ...item, [action === "pin" ? "pinned" : "starred"]: previousValue }
          : item);
        return action === "pin" ? sortDocs(restored) : restored;
      });
      toast({
        title: `Could not ${action} note`,
        description: "The note was restored to its previous state.",
        variant: "error",
      });
    } finally {
      pendingRef.current.delete(key);
      setPendingActions(new Set(pendingRef.current));
    }
  }, [onStarredChange, setDocs, toast]);

  return {
    pendingActions,
    handlePinToggle: (doc: DocumentWithTags) => runAction("pin", doc),
    handleStarToggle: (doc: DocumentWithTags) => runAction("star", doc),
  };
}

type SemanticSearchStatus = "idle" | "searching" | "ready" | "unavailable";

function useSemanticSearch() {
  const [docs, setDocs] = useState<DocumentWithTags[]>([]);
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState<SemanticSearchStatus>("idle");
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    cancel();
    setDocs([]);
    setStatus("idle");
  }, [cancel]);

  const fetchSearch = useCallback(async (query: string) => {
    abortRef.current?.abort();
    if (!query) {
      setDocs([]);
      setStatus("idle");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    setStatus("searching");
    try {
      const res = await apiFetch<{ items: DocumentWithTags[] }>(
        `/ai/search?q=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setDocs(res.items);
      setStatus("ready");
    } catch (error) {
      if (isAbortError(error)) return;
      console.error(error);
      setDocs([]);
      setStatus("unavailable");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setSearching(false);
      }
    }
  }, []);

  return { docs, searching, status, fetchSearch, reset, cancel };
}

export function useDocsData(deps: UseDocsDataDeps) {
  const { search, selectedTag, showStarred, showShared, mergeTags, fetchTagsByIDs, tagIndexRef, toast } = deps;
  const [docs, setDocs] = useState<DocumentWithTags[]>([]);
  const [recentDocs, setRecentDocs] = useState<DocumentWithTags[]>([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [starredTotal, setStarredTotal] = useState(0);
  const [sharedTotal, setSharedTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialError, setInitialError] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextOffset, setNextOffset] = useState(0);
  const {
    docs: semanticSearchDocs,
    searching: semanticSearching,
    status: semanticSearchStatus,
    fetchSearch: fetchSemanticSearch,
    reset: resetSemanticSearch,
    cancel: cancelSemanticSearch,
  } = useSemanticSearch();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const fetchInFlightRef = useRef(false);
  const fetchAbortRef = useRef<AbortController | null>(null);

  const fetchDocs = useCallback(async (offset: number, append: boolean) => {
    if (fetchInFlightRef.current) return;
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    fetchInFlightRef.current = true;
    if (append) {
      setLoadingMore(true);
      setLoadMoreError(false);
    } else {
      setLoading(true);
      setInitialError(false);
    }
    try {
      if (showShared) {
        const params = new URLSearchParams();
        if (search) params.set("q", search);
        const res = await apiFetch<{ items: SharedItem[] }>(`/shares?${params.toString()}`, { signal: controller.signal });
        const items = res.items;
        const tagIDs = new Set<string>();
        setDocs(items.map(mapSharedItem));
        items.forEach((item) => {
          (item.tag_ids ?? []).forEach((id) => tagIDs.add(id));
        });
        if (tagIDs.size > 0) await fetchTagsByIDs(Array.from(tagIDs));
        setHasMore(false);
        setNextOffset(0);
        return;
      }
      const query = new URLSearchParams();
      if (search) query.set("q", search);
      if (selectedTag) query.set("tag_id", selectedTag);
      if (showStarred) query.set("starred", "1");
      query.set("include", "tags");
      query.set("limit", "20");
      query.set("offset", String(offset));
      const res = await apiFetch<DocumentWithTags[]>(`/documents?${query.toString()}`, { signal: controller.signal });
      const enrichedDocs = res.map((doc) => ({
        ...doc, tag_ids: doc.tag_ids || [], tags: doc.tags || [],
      }));
      const missingTagIDs = new Set<string>();
      const providedTagIDs = new Set<string>();
      const tagsFromDocs: Tag[] = [];
      enrichedDocs.forEach((doc) => {
        doc.tags.forEach((tag) => { providedTagIDs.add(tag.id); tagsFromDocs.push(tag); });
        doc.tag_ids.forEach((id) => {
          if (!providedTagIDs.has(id) && !tagIndexRef.current[id]) missingTagIDs.add(id);
        });
      });
      mergeTags(tagsFromDocs);
      await fetchTagsByIDs(Array.from(missingTagIDs));
      setDocs((prev) => {
        if (append) {
          const existingIds = new Set(prev.map(d => d.id));
          const unique = enrichedDocs.filter(d => !existingIds.has(d.id));
          return [...prev, ...unique];
        }
        return sortDocs(enrichedDocs);
      });
      setHasMore(res.length === 20);
      setNextOffset(offset + res.length);
    } catch (e) {
      if (isAbortError(e)) return;
      console.error(e);
      if (append) setLoadMoreError(true);
      else setInitialError(true);
    } finally {
      if (fetchAbortRef.current === controller) fetchAbortRef.current = null;
      if (!controller.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
        fetchInFlightRef.current = false;
      }
    }
  }, [fetchTagsByIDs, mergeTags, search, selectedTag, showStarred, showShared, tagIndexRef]);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await apiFetch<{ recent: DocumentWithTags[]; tag_counts: Record<string, number>; total: number; starred_total: number }>("/documents/summary?limit=5");
      setRecentDocs(sortRecentDocs(res.recent));
      setTotalDocs(res.total);
      setStarredTotal(res.starred_total);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchSharedCount = useCallback(async () => {
    try {
      const shared = await apiFetch<{ items: SharedItem[] }>("/shares");
      setSharedTotal(shared.items.length);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const actions = useDocumentActions({
    setDocs,
    onStarredChange: fetchOverview,
    toast,
  });

  const retryInitial = useCallback(() => {
    fetchInFlightRef.current = false;
    void fetchDocs(0, false);
  }, [fetchDocs]);
  const retryLoadMore = useCallback(() => {
    fetchInFlightRef.current = false;
    void fetchDocs(nextOffset, true);
  }, [fetchDocs, nextOffset]);

  /* v8 ignore start -- IntersectionObserver requires real browser viewport */
  useEffect(() => {
    if (!loadMoreRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (loading || loadingMore || !hasMore) return;
        void fetchDocs(nextOffset, true);
      },
      { rootMargin: "200px" },
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [fetchDocs, hasMore, loading, loadingMore, nextOffset]);
  /* v8 ignore stop */

  useEffect(() => {
    const timer = setTimeout(() => {
      setDocs([]);
      setHasMore(true);
      setNextOffset(0);
      setLoading(true);
      setInitialError(false);
      setLoadMoreError(false);
      setLoadingMore(false);
      fetchInFlightRef.current = false;
      void fetchDocs(0, false);
      if (search && !search.startsWith("/") && !showStarred && !showShared && !selectedTag) {
        void fetchSemanticSearch(search);
      } else {
        resetSemanticSearch();
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      fetchAbortRef.current?.abort();
      cancelSemanticSearch();
    };
  }, [
    fetchDocs,
    showStarred,
    showShared,
    selectedTag,
    search,
    fetchSemanticSearch,
    resetSemanticSearch,
    cancelSemanticSearch,
  ]);

  return {
    docs, recentDocs, totalDocs, starredTotal, sharedTotal,
    loading, loadingMore, initialError, loadMoreError, hasMore,
    semanticSearchDocs, semanticSearching, semanticSearchStatus, loadMoreRef,
    fetchDocs, fetchOverview, fetchSharedCount,
    fetchSemanticSearch,
    retryInitial, retryLoadMore,
    ...actions,
  };
}
