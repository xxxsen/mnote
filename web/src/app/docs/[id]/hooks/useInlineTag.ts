import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { apiFetch } from "@/lib/api";
import type { Tag } from "@/types";
import type { InlineTagDropdownItem } from "../types";
import { MAX_TAGS } from "../constants";
import { normalizeTagName, isValidTagName } from "../utils";

export function useInlineTag(opts: {
  allTags: Tag[];
  selectedTagIDs: string[];
  tagActions: { searchTags: (q: string) => Promise<Tag[]> };
  mergeTags: (items: Tag[]) => void;
  saveTagIDs: (ids: string[]) => Promise<void>;
  findExistingTagByName: (name: string) => Promise<Tag | null>;
  toast: (o: { description: string | Error; variant?: "default" | "success" | "error" }) => void;
}) {
  const { allTags, selectedTagIDs, tagActions, mergeTags, saveTagIDs, findExistingTagByName, toast } = opts;

  const [inlineTagMode, setInlineTagMode] = useState(false);
  const [inlineTagValue, setInlineTagValue] = useState("");
  const [inlineTagResults, setInlineTagResults] = useState<Tag[]>([]);
  const [inlineTagLoading, setInlineTagLoading] = useState(false);
  const [inlineTagIndex, setInlineTagIndex] = useState(0);
  const [inlineTagMenuPos, setInlineTagMenuPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const inlineTagInputRef = useRef<HTMLInputElement | null>(null);
  const inlineTagComposeRef = useRef(false);
  const inlineTagSearchTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!inlineTagMode) return;
    inlineTagInputRef.current?.focus();
  }, [inlineTagMode]);

  useEffect(() => {
    if (!inlineTagMode) { setInlineTagMenuPos(null); return; } // eslint-disable-line react-hooks/set-state-in-effect -- cleanup on mode toggle
    const updateMenuPosition = () => {
      const input = inlineTagInputRef.current;
      if (!input) { setInlineTagMenuPos(null); return; }
      const rect = input.getBoundingClientRect();
      setInlineTagMenuPos({ left: rect.left, top: rect.bottom + 4, width: Math.max(rect.width, 192) });
    };
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [inlineTagMode, inlineTagValue]);

  const inlineTagTrimmed = useMemo(() => normalizeTagName(inlineTagValue), [inlineTagValue]);
  const inlineTagSuggestions = useMemo(
    () => inlineTagResults.filter((tag) => !selectedTagIDs.includes(tag.id)),
    [inlineTagResults, selectedTagIDs]
  );
  const inlineTagExact = useMemo(
    () => inlineTagSuggestions.find((tag) => tag.name === inlineTagTrimmed) || allTags.find((tag) => tag.name === inlineTagTrimmed) || null,
    [allTags, inlineTagSuggestions, inlineTagTrimmed]
  );

  const inlineTagDropdownItems = useMemo(() => {
    if (!inlineTagTrimmed || inlineTagLoading) return [] as InlineTagDropdownItem[];
    const items: InlineTagDropdownItem[] = [];
    if (inlineTagExact) {
      items.push({ key: `use-${inlineTagExact.id}`, type: "use", tag: inlineTagExact });
    } else if (isValidTagName(inlineTagTrimmed)) {
      items.push({ key: `create-${inlineTagTrimmed}`, type: "create", name: inlineTagTrimmed });
    }
    inlineTagSuggestions.forEach((tag) => {
      if (inlineTagExact && tag.id === inlineTagExact.id) return;
      items.push({ key: `suggestion-${tag.id}`, type: "suggestion", tag });
    });
    return items.slice(0, 8);
  }, [inlineTagTrimmed, inlineTagLoading, inlineTagExact, inlineTagSuggestions]);

  useEffect(() => {
    if (!inlineTagMode) { setInlineTagResults([]); setInlineTagLoading(false); setInlineTagIndex(0); return; } // eslint-disable-line react-hooks/set-state-in-effect -- cleanup on mode toggle
    if (inlineTagSearchTimerRef.current) window.clearTimeout(inlineTagSearchTimerRef.current);
    if (!inlineTagTrimmed) { setInlineTagResults([]); setInlineTagLoading(false); setInlineTagIndex(0); return; }
    inlineTagSearchTimerRef.current = window.setTimeout(() => {
      setInlineTagLoading(true);
      tagActions.searchTags(inlineTagTrimmed).then((res) => {
        setInlineTagResults(res);
        mergeTags(res);
      }).catch(() => { setInlineTagResults([]); }).finally(() => { setInlineTagLoading(false); });
    }, 180);
    return () => { if (inlineTagSearchTimerRef.current) window.clearTimeout(inlineTagSearchTimerRef.current); };
  }, [inlineTagMode, inlineTagTrimmed, tagActions, mergeTags]);

  useEffect(() => {
    setInlineTagIndex(0); // eslint-disable-line react-hooks/set-state-in-effect -- reset index when dropdown items change
  }, [inlineTagDropdownItems]);

  const handleInlineAddTag = useCallback(async (name?: string) => {
    const trimmed = normalizeTagName(name ?? inlineTagValue);
    if (!trimmed) { setInlineTagMode(false); setInlineTagValue(""); return; }
    if (!isValidTagName(trimmed)) {
      toast({ description: "Tags must be letters, numbers, or Chinese characters, and at most 16 characters." });
      return;
    }
    if (selectedTagIDs.length >= MAX_TAGS) {
      toast({ description: `You can only select up to ${MAX_TAGS} tags.` });
      return;
    }
    try {
      let existing = allTags.find((tag) => tag.name === trimmed) || null;
      if (!existing) existing = await findExistingTagByName(trimmed);
      if (existing) {
        if (!selectedTagIDs.includes(existing.id)) await saveTagIDs([...selectedTagIDs, existing.id]);
      } else {
        const created = await apiFetch<Tag>("/tags", { method: "POST", body: JSON.stringify({ name: trimmed }) });
        mergeTags([created]);
        await saveTagIDs([...selectedTagIDs, created.id]);
      }
      setInlineTagValue("");
      setInlineTagMode(false);
    } catch (err) {
      toast({ description: err instanceof Error ? err.message : "Failed to add tag", variant: "error" });
    }
  }, [allTags, findExistingTagByName, inlineTagValue, mergeTags, saveTagIDs, selectedTagIDs, toast]);

  const handleInlineTagSelect = useCallback(async (item: InlineTagDropdownItem) => {
    if (item.tag) {
      if (!selectedTagIDs.includes(item.tag.id)) {
        if (selectedTagIDs.length >= MAX_TAGS) {
          toast({ description: `You can only select up to ${MAX_TAGS} tags.` });
          return;
        }
        await saveTagIDs([...selectedTagIDs, item.tag.id]);
      }
      setInlineTagMode(false);
      setInlineTagValue("");
      return;
    }
    if (item.type === "create" && item.name) await handleInlineAddTag(item.name);
  }, [handleInlineAddTag, saveTagIDs, selectedTagIDs, toast]);

  return {
    inlineTagMode, setInlineTagMode,
    inlineTagValue, setInlineTagValue,
    inlineTagLoading,
    inlineTagIndex, setInlineTagIndex,
    inlineTagMenuPos,
    inlineTagInputRef,
    inlineTagComposeRef,
    inlineTagDropdownItems,
    handleInlineAddTag,
    handleInlineTagSelect,
  };
}
