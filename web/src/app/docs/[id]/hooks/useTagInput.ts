"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CompositionEvent, type KeyboardEvent } from "react";
import { apiFetch } from "@/lib/api";
import type { Tag } from "@/types";

type TagDropdownItem = {
  key: string;
  type: "use" | "create" | "suggestion";
  tag?: Tag;
};

type UseTagInputOptions = {
  allTags: Tag[];
  selectedTagIDs: string[];
  maxTags: number;
  normalizeTagName: (name: string) => string;
  isValidTagName: (name: string) => boolean;
  mergeTags: (items: Tag[]) => void;
  searchTags: (query: string) => Promise<Tag[]>;
  saveTagIDs: (nextTagIDs: string[]) => Promise<void>;
  notify: (message: string) => void;
  notifyError: (message: string) => void;
};

export function useTagInput({
  allTags,
  selectedTagIDs,
  maxTags,
  normalizeTagName,
  isValidTagName,
  mergeTags,
  searchTags,
  saveTagIDs,
  notify,
  notifyError,
}: UseTagInputOptions) {
  const [tagQuery, setTagQuery] = useState("");
  const [tagResults, setTagResults] = useState<Tag[]>([]);
  const [tagSearchLoading, setTagSearchLoading] = useState(false);
  const [tagDropdownIndex, setTagDropdownIndex] = useState(0);

  const isComposingRef = useRef(false);
  const tagSearchTimerRef = useRef<number | null>(null);
  const lastTagQueryRef = useRef("");

  const tagSuggestions = useMemo(
    () => tagResults.filter((tag) => !selectedTagIDs.includes(tag.id)),
    [selectedTagIDs, tagResults]
  );

  const trimmedTagQuery = useMemo(() => normalizeTagName(tagQuery), [normalizeTagName, tagQuery]);

  const exactTagMatch = useMemo(
    () => tagSuggestions.find((tag) => tag.name === trimmedTagQuery) || allTags.find((tag) => tag.name === trimmedTagQuery) || null,
    [allTags, tagSuggestions, trimmedTagQuery]
  );

  const tagDropdownItems = useMemo(() => {
    if (!trimmedTagQuery || tagSearchLoading) return [] as TagDropdownItem[];
    const items: TagDropdownItem[] = [];
    if (exactTagMatch) {
      items.push({ key: `use-${exactTagMatch.id}`, type: "use", tag: exactTagMatch });
    } else if (isValidTagName(trimmedTagQuery)) {
      items.push({ key: `create-${trimmedTagQuery}`, type: "create" });
    }

    tagSuggestions.forEach((tag) => {
      if (exactTagMatch && tag.id === exactTagMatch.id) return;
      items.push({ key: `tag-${tag.id}`, type: "suggestion", tag });
    });

    return items;
  }, [exactTagMatch, isValidTagName, tagSearchLoading, tagSuggestions, trimmedTagQuery]);

  const runSearchTags = useCallback(
    async (query: string) => {
      const trimmed = normalizeTagName(query);
      if (!trimmed) {
        setTagResults([]);
        setTagSearchLoading(false);
        return;
      }
      setTagSearchLoading(true);
      lastTagQueryRef.current = trimmed;
      try {
        const res = await searchTags(trimmed);
        if (lastTagQueryRef.current !== trimmed) return;
        const next = res || [];
        setTagResults(next);
        mergeTags(next);
      } catch {
        if (lastTagQueryRef.current === trimmed) {
          setTagResults([]);
        }
      } finally {
        if (lastTagQueryRef.current === trimmed) {
          setTagSearchLoading(false);
        }
      }
    },
    [mergeTags, normalizeTagName, searchTags]
  );

  useEffect(() => {
    if (tagSearchTimerRef.current) {
      window.clearTimeout(tagSearchTimerRef.current);
    }
    if (!tagQuery) {
      setTagResults([]);
      setTagSearchLoading(false);
      return;
    }

    tagSearchTimerRef.current = window.setTimeout(() => {
      void runSearchTags(tagQuery);
    }, 200);

    return () => {
      if (tagSearchTimerRef.current) {
        window.clearTimeout(tagSearchTimerRef.current);
      }
    };
  }, [runSearchTags, tagQuery]);

  useEffect(() => {
    if (trimmedTagQuery) {
      setTagDropdownIndex(0);
    }
  }, [trimmedTagQuery, tagResults]);

  const clearTagQuery = useCallback(() => {
    setTagQuery("");
    setTagResults([]);
    setTagDropdownIndex(0);
  }, []);

  const findExistingTagByName = useCallback(
    async (name: string) => {
      const trimmed = normalizeTagName(name);
      if (!trimmed) return null;
      const cached = allTags.find((tag) => tag.name === trimmed);
      if (cached) return cached;

      try {
        const res = await searchTags(trimmed);
        const exact = (res || []).find((tag) => tag.name === trimmed) || null;
        if (exact) {
          mergeTags([exact]);
        }
        return exact;
      } catch {
        return null;
      }
    },
    [allTags, mergeTags, normalizeTagName, searchTags]
  );

  const selectTagByID = useCallback(
    async (tagID: string) => {
      if (selectedTagIDs.includes(tagID)) {
        clearTagQuery();
        return;
      }
      if (selectedTagIDs.length >= maxTags) {
        notify(`You can only select up to ${maxTags} tags.`);
        return;
      }
      await saveTagIDs([...selectedTagIDs, tagID]);
      clearTagQuery();
    },
    [clearTagQuery, maxTags, notify, saveTagIDs, selectedTagIDs]
  );

  const handleAddTag = useCallback(async () => {
    const trimmed = normalizeTagName(tagQuery);
    if (!trimmed) return;

    if (!isValidTagName(trimmed)) {
      notify("Tags must be letters, numbers, or Chinese characters, and at most 16 characters.");
      return;
    }

    try {
      let existing = tagSuggestions.find((tag) => tag.name === trimmed) || allTags.find((tag) => tag.name === trimmed) || null;
      if (!existing) {
        existing = await findExistingTagByName(trimmed);
      }

      if (existing) {
        if (!selectedTagIDs.includes(existing.id)) {
          if (selectedTagIDs.length >= maxTags) {
            notify(`You can only select up to ${maxTags} tags.`);
            return;
          }
          await saveTagIDs([...selectedTagIDs, existing.id]);
        }
        clearTagQuery();
        return;
      }

      if (selectedTagIDs.length >= maxTags) {
        notify(`You can only select up to ${maxTags} tags.`);
        return;
      }

      const created = await apiFetch<Tag>("/tags", {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
      });
      mergeTags([created]);
      await saveTagIDs([...selectedTagIDs, created.id]);
      clearTagQuery();
    } catch (err) {
      notifyError(err instanceof Error ? err.message : "Failed to add tag");
    }
  }, [
    allTags,
    clearTagQuery,
    findExistingTagByName,
    isValidTagName,
    maxTags,
    mergeTags,
    normalizeTagName,
    notify,
    notifyError,
    saveTagIDs,
    selectedTagIDs,
    tagQuery,
    tagSuggestions,
  ]);

  const handleTagDropdownSelect = useCallback(
    (item: { type: "use" | "create" | "suggestion"; tag?: Tag }) => {
      if (item.type === "create") {
        void handleAddTag();
        return;
      }
      if (item.tag) {
        void selectTagByID(item.tag.id);
      }
    },
    [handleAddTag, selectTagByID]
  );

  const handleTagInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (!trimmedTagQuery || tagSearchLoading) {
        if (event.key === "Enter") {
          void handleAddTag();
        }
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (tagDropdownItems.length === 0) return;
        setTagDropdownIndex((prev) => (prev + 1) % tagDropdownItems.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (tagDropdownItems.length === 0) return;
        setTagDropdownIndex((prev) => (prev - 1 + tagDropdownItems.length) % tagDropdownItems.length);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        clearTagQuery();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (tagDropdownItems.length > 0) {
          handleTagDropdownSelect(tagDropdownItems[tagDropdownIndex]);
          return;
        }
        void handleAddTag();
      }
    },
    [clearTagQuery, handleAddTag, handleTagDropdownSelect, tagDropdownIndex, tagDropdownItems, tagSearchLoading, trimmedTagQuery]
  );

  const handleTagInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    if (isComposingRef.current) {
      setTagQuery(raw);
      return;
    }
    const filtered = raw.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "");
    setTagQuery(filtered);
  }, []);

  const handleTagCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleTagCompositionEnd = useCallback((event: CompositionEvent<HTMLInputElement>) => {
    isComposingRef.current = false;
    const raw = event.currentTarget.value;
    const filtered = raw.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "");
    setTagQuery(filtered.slice(0, 16));
  }, []);

  return {
    tagQuery,
    tagSearchLoading,
    tagDropdownIndex,
    trimmedTagQuery,
    tagDropdownItems,
    findExistingTagByName,
    handleTagInputChange,
    handleTagCompositionStart,
    handleTagCompositionEnd,
    handleTagInputKeyDown,
    handleTagDropdownSelect,
  };
}
