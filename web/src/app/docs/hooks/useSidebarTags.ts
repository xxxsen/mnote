import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { TagSummary } from "../types";

type ToastVariant = "default" | "success" | "error";

interface UseSidebarTagsDeps {
  toast: (opts: { description: string; variant?: ToastVariant }) => void;
}

export function useSidebarTags({ toast }: UseSidebarTagsDeps) {
  const [sidebarTags, setSidebarTags] = useState<TagSummary[]>([]);
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [sidebarHasMore, setSidebarHasMore] = useState(true);
  const [sidebarOffset, setSidebarOffset] = useState(0);
  const [tagSearch, setTagSearch] = useState("");
  const sidebarFetchInFlightRef = useRef(false);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const tagListRef = useRef<HTMLDivElement>(null);
  const tagAutoLoadAtRef = useRef(0);

  const fetchSidebarTags = useCallback(
    async (offset: number, append: boolean, query: string) => {
      if (sidebarFetchInFlightRef.current) return;
      sidebarFetchInFlightRef.current = true;
      setSidebarLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("limit", "20");
        params.set("offset", String(offset));
        if (query) params.set("q", query);
        const res = await apiFetch<TagSummary[]>(`/tags/summary?${params.toString()}`);
        const next = res;
        setSidebarTags((prev) => (append ? [...prev, ...next] : next));
        setSidebarHasMore(next.length === 20);
        setSidebarOffset(offset + next.length);
      } catch (e) {
        console.error(e);
      } finally {
        sidebarFetchInFlightRef.current = false;
        setSidebarLoading(false);
      }
    },
    [],
  );

  const handleToggleTagPin = useCallback(
    async (tag: TagSummary) => {
      const nextPinned = tag.pinned ? 0 : 1;
      try {
        await apiFetch(`/tags/${tag.id}/pin`, {
          method: "PUT",
          body: JSON.stringify({ pinned: nextPinned === 1 }),
        });
        setSidebarOffset(0);
        setSidebarHasMore(true);
        void fetchSidebarTags(0, false, tagSearch.trim());
      } catch (e) {
        console.error(e);
        toast({ description: "Failed to update tag pin", variant: "error" });
      }
    },
    [fetchSidebarTags, tagSearch, toast],
  );

  const loadMoreSidebarTags = useCallback(() => {
    if (sidebarLoading || !sidebarHasMore) return;
    void fetchSidebarTags(sidebarOffset, true, tagSearch.trim());
  }, [fetchSidebarTags, sidebarHasMore, sidebarLoading, sidebarOffset, tagSearch]);

  const maybeAutoLoadTags = useCallback(() => {
    if (sidebarLoading || !sidebarHasMore) return;
    const now = Date.now();
    if (now - tagAutoLoadAtRef.current < 400) return;
    const container = sidebarScrollRef.current;
    if (!container) return;
    const nearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 40;
    const notScrollable = container.scrollHeight <= container.clientHeight + 1;
    if (nearBottom || notScrollable) {
      tagAutoLoadAtRef.current = now;
      loadMoreSidebarTags();
    }
  }, [loadMoreSidebarTags, sidebarHasMore, sidebarLoading]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSidebarOffset(0);
      setSidebarHasMore(true);
      void fetchSidebarTags(0, false, tagSearch.trim());
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchSidebarTags, tagSearch]);

  return {
    sidebarTags, sidebarLoading, sidebarHasMore,
    tagSearch, setTagSearch,
    sidebarScrollRef, tagListRef,
    fetchSidebarTags, handleToggleTagPin, maybeAutoLoadTags,
  };
}
