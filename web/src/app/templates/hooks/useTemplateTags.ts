"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import type { Tag } from "@/types";
import { MAX_TAGS, TAG_NAME_REGEX } from "../utils";

export function useTemplateTags(selectedTemplate: { default_tag_ids?: string[] } | null) {
  const { toast } = useToast();
  const [selectedTagIDs, setSelectedTagIDs] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);

  const tagMap = useMemo(() => {
    const map: Record<string, Tag> = {};
    allTags.forEach((tag) => { map[tag.id] = tag; });
    return map;
  }, [allTags]);

  const visibleSelectedTags = useMemo(
    () => selectedTagIDs.map((id) => tagMap[id]).filter((t): t is Tag => Boolean(t)),
    [selectedTagIDs, tagMap]
  );

  const [prevTemplate, setPrevTemplate] = useState(selectedTemplate);
  if (selectedTemplate !== prevTemplate) {
    setPrevTemplate(selectedTemplate);
    setSelectedTagIDs(selectedTemplate?.default_tag_ids ?? []);
    setShowTagInput(false);
  }

  useEffect(() => {
    const missingIDs = selectedTagIDs.filter((id) => !allTags.some((tag) => tag.id === id));
    if (missingIDs.length === 0) return;
    const loadMissingTags = async () => {
      try {
        const items = await apiFetch<Tag[]>("/tags/ids", { method: "POST", body: JSON.stringify({ ids: missingIDs }) });
        if (items.length === 0) return;
        setAllTags((prev) => {
          const map = new Map(prev.map((tag) => [tag.id, tag] as const));
          items.forEach((tag) => map.set(tag.id, tag));
          return Array.from(map.values());
        });
      } catch { /* unresolved/deleted tags stay hidden */ }
    };
    void loadMissingTags();
  }, [allTags, selectedTagIDs]);

  const addTag = useCallback(async (nameOrTag: string | Tag) => {
    if (selectedTagIDs.length >= MAX_TAGS) {
      toast({ description: `You can only select up to ${MAX_TAGS} tags.` });
      return;
    }
    if (typeof nameOrTag !== "string") {
      if (!selectedTagIDs.includes(nameOrTag.id)) setSelectedTagIDs((prev) => [...prev, nameOrTag.id]);
      setTagQuery(""); setShowTagInput(false);
      return;
    }
    const name = nameOrTag.trim();
    if (!name) return;
    if (!TAG_NAME_REGEX.test(name)) {
      toast({ description: "Tags must be letters, numbers, or Chinese characters, and at most 16 characters.", variant: "error" });
      return;
    }
    try {
      const created = await apiFetch<Tag>("/tags", { method: "POST", body: JSON.stringify({ name }) });
      setAllTags((prev) => [...prev, created]);
      setSelectedTagIDs((prev) => [...prev, created.id]);
      setTagQuery(""); setShowTagInput(false);
    } catch (err) {
      try {
        const params = new URLSearchParams(); params.set("q", name); params.set("limit", "10");
        const found = await apiFetch<Tag[]>(`/tags?${params.toString()}`);
        const existing = found.find((tag) => tag.name === name) ?? null;
        if (existing) {
          setAllTags((prev) => prev.some((tag) => tag.id === existing.id) ? prev : [...prev, existing]);
          if (!selectedTagIDs.includes(existing.id)) setSelectedTagIDs((prev) => [...prev, existing.id]);
          setTagQuery(""); setShowTagInput(false);
          return;
        }
      } catch { /* show original error below */ }
      toast({ description: err instanceof Error ? err.message : "Failed to create tag", variant: "error" });
    }
  }, [selectedTagIDs, toast]);

  return {
    selectedTagIDs, setSelectedTagIDs, visibleSelectedTags,
    tagQuery, setTagQuery, showTagInput, setShowTagInput, addTag,
  };
}
