import { useCallback, useRef, useState, useEffect } from "react";
import type { Tag } from "@/types";
import { apiFetch } from "@/lib/api";

export function useTagIndex() {
  const [tagIndex, setTagIndex] = useState<Record<string, Tag>>({});
  const tagIndexRef = useRef<Record<string, Tag>>({});
  const tagFetchInFlightRef = useRef(false);

  useEffect(() => {
    tagIndexRef.current = tagIndex;
  }, [tagIndex]);

  const mergeTags = useCallback((items: Tag[]) => {
    if (!items.length) return;
    setTagIndex((prev) => {
      const next = { ...prev };
      items.forEach((tag) => {
        next[tag.id] = tag;
      });
      return next;
    });
  }, []);

  const fetchTagsByIDs = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      try {
        const res = await apiFetch<Tag[]>("/tags/ids", {
          method: "POST",
          body: JSON.stringify({ ids }),
        });
        mergeTags(res || []);
      } catch (e) {
        console.error(e);
      }
    },
    [mergeTags],
  );

  const fetchTags = useCallback(
    async (query: string) => {
      if (tagFetchInFlightRef.current) return;
      tagFetchInFlightRef.current = true;
      try {
        const params = new URLSearchParams();
        params.set("limit", "20");
        if (query) {
          params.set("q", query);
        }
        const res = await apiFetch<Tag[]>(`/tags?${params.toString()}`);
        mergeTags(res || []);
      } catch (e) {
        console.error(e);
      } finally {
        tagFetchInFlightRef.current = false;
      }
    },
    [mergeTags],
  );

  return { tagIndex, tagIndexRef, mergeTags, fetchTagsByIDs, fetchTags };
}
