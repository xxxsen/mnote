import { useState, useCallback, useMemo } from "react";
import type { Tag } from "@/types";
import { MAX_TAGS } from "../constants";
import { normalizeTagName } from "../utils";

export function useTagState(opts: {
  tagActions: { saveTags: (ids: string[]) => Promise<void>; searchTags: (q: string) => Promise<Tag[]> };
  toast: (o: { description: string | Error; variant?: "default" | "success" | "error" }) => void;
  setLastSavedAt: (ts: number) => void;
}) {
  const { tagActions, toast, setLastSavedAt } = opts;

  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagIDs, setSelectedTagIDs] = useState<string[]>([]);

  const tagIndex = useMemo(() => {
    const map: Record<string, Tag> = {};
    allTags.forEach((tag) => { map[tag.id] = tag; });
    return map;
  }, [allTags]);

  const selectedTags = useMemo(
    () => selectedTagIDs.map((id) => tagIndex[id]),
    [selectedTagIDs, tagIndex]
  );

  const mergeTags = useCallback((items: Tag[]) => {
    if (!items.length) return;
    setAllTags((prev) => {
      const seen = new Set(prev.map((tag) => tag.id));
      const next = [...prev];
      items.forEach((tag) => {
        if (!seen.has(tag.id)) { seen.add(tag.id); next.push(tag); }
      });
      return next;
    });
  }, []);

  const saveTagIDs = useCallback(
    async (nextTagIDs: string[]) => {
      const previous = selectedTagIDs;
      setSelectedTagIDs(nextTagIDs);
      try {
        await tagActions.saveTags(nextTagIDs);
        setLastSavedAt(Math.floor(Date.now() / 1000));
      } catch (err) {
        console.error(err);
        toast({ description: err instanceof Error ? err : "Failed to save tags", variant: "error" });
        setSelectedTagIDs(previous);
      }
    },
    [selectedTagIDs, tagActions, toast, setLastSavedAt]
  );

  const findExistingTagByName = useCallback(
    async (name: string) => {
      const trimmed = normalizeTagName(name);
      if (!trimmed) return null;
      const cached = allTags.find((tag) => tag.name === trimmed);
      if (cached) return cached;
      try {
        const res = await tagActions.searchTags(trimmed);
        const exact = res.find((tag) => tag.name === trimmed) ?? null;
        if (exact) mergeTags([exact]);
        return exact;
      } catch { return null; }
    },
    [allTags, mergeTags, tagActions]
  );

  const toggleTag = useCallback((tagID: string) => {
    if (selectedTagIDs.includes(tagID)) {
      void saveTagIDs(selectedTagIDs.filter((id) => id !== tagID));
      return;
    }
    if (selectedTagIDs.length >= MAX_TAGS) {
      toast({ description: `You can only select up to ${MAX_TAGS} tags.` });
      return;
    }
    void saveTagIDs([...selectedTagIDs, tagID]);
  }, [selectedTagIDs, saveTagIDs, toast]);

  return {
    allTags, setAllTags,
    selectedTagIDs, setSelectedTagIDs,
    tagIndex,
    selectedTags,
    mergeTags,
    saveTagIDs,
    findExistingTagByName,
    toggleTag,
  };
}
