import { useCallback, useEffect, useRef, useState } from "react";
import type { Tag } from "@/types";
import { apiFetch } from "@/lib/api";
import type { DocumentWithTags, SharedItem } from "../types";
import { sortDocs, sortRecentDocs } from "../utils";

interface UseDocsDataDeps {
  search: string;
  selectedTag: string;
  showStarred: boolean;
  showShared: boolean;
  mergeTags: (items: Tag[]) => void;
  fetchTagsByIDs: (ids: string[]) => Promise<void>;
  tagIndexRef: { current: Record<string, Tag> };
}

export function useDocsData(deps: UseDocsDataDeps) {
  const { search, selectedTag, showStarred, showShared, mergeTags, fetchTagsByIDs, tagIndexRef } = deps;
  const [docs, setDocs] = useState<DocumentWithTags[]>([]);
  const [recentDocs, setRecentDocs] = useState<DocumentWithTags[]>([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [starredTotal, setStarredTotal] = useState(0);
  const [sharedTotal, setSharedTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextOffset, setNextOffset] = useState(0);
  const [aiSearchDocs, setAiSearchDocs] = useState<DocumentWithTags[]>([]);
  const [aiSearching, setAiSearching] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const fetchInFlightRef = useRef(false);

  const fetchAiSearch = useCallback(async (query: string) => {
    if (!query) { setAiSearchDocs([]); return; }
    setAiSearching(true);
    try {
      const res = await apiFetch<{ items: DocumentWithTags[] }>(`/ai/search?q=${encodeURIComponent(query)}`);
      setAiSearchDocs(res?.items || []);
    } catch (e) {
      console.error(e);
      setAiSearchDocs([]);
    } finally {
      setAiSearching(false);
    }
  }, []);

  const fetchDocs = useCallback(async (offset: number, append: boolean) => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    if (append) { setLoadingMore(true); } else { setLoading(true); }
    try {
      if (showShared) {
        const params = new URLSearchParams();
        if (search) params.set("q", search);
        const res = await apiFetch<{ items: SharedItem[] }>(`/shares?${params.toString()}`);
        const items = res?.items || [];
        const tagIDs = new Set<string>();
        setDocs(items.map((item) => ({
          id: item.id, user_id: "", title: item.title,
          content: item.summary || "", summary: item.summary || "",
          state: 1, pinned: 0, starred: 0,
          ctime: item.mtime, mtime: item.mtime,
          tags: [], tag_ids: item.tag_ids || [],
          share_token: item.token,
        } as DocumentWithTags)));
        items.forEach((item) => {
          (item.tag_ids || []).forEach((id) => tagIDs.add(id));
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
      const res = await apiFetch<DocumentWithTags[]>(`/documents?${query.toString()}`);
      const enrichedDocs = (res || []).map((doc) => ({
        ...doc, tag_ids: doc.tag_ids || [], tags: doc.tags || [],
      }));
      const missingTagIDs = new Set<string>();
      const providedTagIDs = new Set<string>();
      const tagsFromDocs: Tag[] = [];
      enrichedDocs.forEach((doc) => {
        (doc.tags || []).forEach((tag) => { providedTagIDs.add(tag.id); tagsFromDocs.push(tag); });
        (doc.tag_ids || []).forEach((id) => {
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
      setHasMore((res || []).length === 20);
      setNextOffset(offset + (res || []).length);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      fetchInFlightRef.current = false;
    }
  }, [fetchTagsByIDs, mergeTags, search, selectedTag, showStarred, showShared, tagIndexRef]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await apiFetch<{ recent: DocumentWithTags[]; tag_counts: Record<string, number>; total: number; starred_total: number }>("/documents/summary?limit=5");
      setRecentDocs(sortRecentDocs((res?.recent || []) as DocumentWithTags[]));
      setTotalDocs(res?.total || 0);
      setStarredTotal(res?.starred_total || 0);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchSharedSummary = useCallback(async () => {
    try {
      const shared = await apiFetch<{ items: SharedItem[] }>("/shares");
      setSharedTotal(shared?.items?.length || 0);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handlePinToggle = useCallback(async (e: React.MouseEvent, doc: DocumentWithTags) => {
    e.stopPropagation();
    const newPinned = doc.pinned ? 0 : 1;
    setDocs(prev => {
      const updated = prev.map(d => d.id === doc.id ? { ...d, pinned: newPinned } : d);
      return sortDocs(updated);
    });
    try {
      await apiFetch(`/documents/${doc.id}/pin`, {
        method: "PUT", body: JSON.stringify({ pinned: newPinned === 1 }),
      });
    } catch (err) {
      console.error("Failed to pin document", err);
    }
  }, []);

  const handleStarToggle = useCallback(async (e: React.MouseEvent, doc: DocumentWithTags) => {
    e.stopPropagation();
    const newStarred = doc.starred ? 0 : 1;
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, starred: newStarred } : d));
    try {
      await apiFetch(`/documents/${doc.id}/star`, {
        method: "PUT", body: JSON.stringify({ starred: newStarred === 1 }),
      });
      void fetchSummary(); // eslint-disable-line @typescript-eslint/no-floating-promises
    } catch (err) {
      console.error("Failed to star document", err);
    }
  }, [fetchSummary]);

  useEffect(() => {
    if (!loadMoreRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting) return;
        if (loading || loadingMore || !hasMore) return;
        void fetchDocs(nextOffset, true);
      },
      { rootMargin: "200px" },
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [fetchDocs, hasMore, loading, loadingMore, nextOffset]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDocs([]);
      setHasMore(true);
      setNextOffset(0);
      setLoading(true);
      setLoadingMore(false);
      fetchInFlightRef.current = false;
      void fetchDocs(0, false);
      if (search && !search.startsWith("/") && !showStarred && !showShared && !selectedTag) {
        void fetchAiSearch(search);
      } else {
        setAiSearchDocs([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchDocs, showStarred, showShared, selectedTag, search, fetchAiSearch]);

  return {
    docs, recentDocs, totalDocs, starredTotal, sharedTotal,
    loading, loadingMore, hasMore, aiSearchDocs, aiSearching, loadMoreRef,
    fetchDocs, fetchSummary, fetchSharedSummary, fetchAiSearch,
    handlePinToggle, handleStarToggle,
  };
}
