"use client";

import { useCallback, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Tag } from "@/types";
import type { AIAction, DiffLine } from "../types";

type UseAiAssistantOptions = {
  docId: string;
  maxTags: number;
  normalizeTagName: (value: string) => string;
  isValidTagName: (value: string) => boolean;
  notify: (message: string) => void;
};

type ApplyAiSummaryOptions = {
  onApplied: (summary: string) => void;
  onError: (message: string) => void;
};

type ApplyAiTagsOptions = {
  findExistingTagByName: (name: string) => Promise<Tag | null>;
  mergeTags: (items: Tag[]) => void;
  saveTagIDs: (tagIDs: string[]) => Promise<void>;
  onError: (message: string) => void;
};

const buildLineDiff = (before: string, after: string): DiffLine[] => {
  const leftLines = before.split("\n");
  const rightLines = after.split("\n");
  const m = leftLines.length;
  const n = rightLines.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (leftLines[i] === rightLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (leftLines[i] === rightLines[j]) {
      result.push({ type: "equal", left: leftLines[i], right: rightLines[j] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: "remove", left: leftLines[i] });
      i += 1;
    } else {
      result.push({ type: "add", right: rightLines[j] });
      j += 1;
    }
  }
  while (i < m) {
    result.push({ type: "remove", left: leftLines[i] });
    i += 1;
  }
  while (j < n) {
    result.push({ type: "add", right: rightLines[j] });
    j += 1;
  }
  return result;
};

export function useAiAssistant({ docId, maxTags, normalizeTagName, isValidTagName, notify }: UseAiAssistantOptions) {
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiAction, setAiAction] = useState<AIAction | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiOriginalText, setAiOriginalText] = useState("");
  const [aiResultText, setAiResultText] = useState("");
  const [aiExistingTags, setAiExistingTags] = useState<Tag[]>([]);
  const [aiSuggestedTags, setAiSuggestedTags] = useState<string[]>([]);
  const [aiSelectedTags, setAiSelectedTags] = useState<string[]>([]);
  const [aiRemovedTagIDs, setAiRemovedTagIDs] = useState<string[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);

  const aiDiffLines = useMemo(
    () => (aiOriginalText && aiResultText ? buildLineDiff(aiOriginalText, aiResultText) : []),
    [aiOriginalText, aiResultText]
  );

  const aiExistingTagNames = useMemo(() => {
    const names = new Set<string>();
    aiExistingTags.forEach((tag) => {
      if (tag.name) names.add(tag.name);
    });
    return names;
  }, [aiExistingTags]);

  const aiTitle =
    aiAction === "polish"
      ? "AI Polish"
      : aiAction === "generate"
      ? "AI Generate"
      : aiAction === "summary"
      ? "AI Summary"
      : "AI Tags";

  const aiExistingCount = Math.max(0, aiExistingTags.length - aiRemovedTagIDs.length);
  const aiAvailableSlots = Math.max(0, maxTags - aiExistingCount);

  const resetAiState = useCallback(() => {
    setAiError(null);
    setAiResultText("");
    setAiExistingTags([]);
    setAiSuggestedTags([]);
    setAiSelectedTags([]);
    setAiRemovedTagIDs([]);
  }, []);

  const closeAiModal = useCallback(() => {
    setAiModalOpen(false);
    setAiAction(null);
    setAiLoading(false);
    setAiPrompt("");
    setAiOriginalText("");
    resetAiState();
  }, [resetAiState]);

  const handleAiPolish = useCallback(
    async (snapshot: string) => {
      if (!snapshot.trim()) {
        notify("Please add some content before polishing.");
        return;
      }
      setAiAction("polish");
      setAiModalOpen(true);
      setAiLoading(true);
      setAiOriginalText(snapshot);
      resetAiState();
      try {
        const res = await apiFetch<{ text: string }>("/ai/polish", {
          method: "POST",
          body: JSON.stringify({ text: snapshot }),
        });
        setAiResultText(res?.text || "");
      } catch (err) {
        setAiError(err instanceof Error ? err.message : "AI request failed");
      } finally {
        setAiLoading(false);
      }
    },
    [notify, resetAiState]
  );

  const handleAiGenerateOpen = useCallback(() => {
    setAiAction("generate");
    setAiModalOpen(true);
    setAiPrompt("");
    setAiOriginalText("");
    resetAiState();
  }, [resetAiState]);

  const handleAiGenerate = useCallback(async () => {
    const prompt = aiPrompt.trim();
    if (!prompt) {
      setAiError("Please enter a brief description.");
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await apiFetch<{ text: string }>("/ai/generate", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      });
      setAiResultText(res?.text || "");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI request failed");
    } finally {
      setAiLoading(false);
    }
  }, [aiPrompt]);

  const handleAiSummary = useCallback(
    async (snapshot: string) => {
      if (!snapshot.trim()) {
        notify("Please add some content before summarizing.");
        return;
      }
      setAiAction("summary");
      setAiModalOpen(true);
      setAiLoading(true);
      setAiOriginalText(snapshot);
      resetAiState();
      try {
        const res = await apiFetch<{ summary: string }>("/ai/summary", {
          method: "POST",
          body: JSON.stringify({ text: snapshot }),
        });
        setAiResultText(res?.summary || "");
      } catch (err) {
        setAiError(err instanceof Error ? err.message : "AI request failed");
      } finally {
        setAiLoading(false);
      }
    },
    [notify, resetAiState]
  );

  const handleAiTags = useCallback(
    async (snapshot: string) => {
      if (!snapshot.trim()) {
        notify("Please add some content before extracting tags.");
        return;
      }
      setAiAction("tags");
      setAiModalOpen(true);
      setAiLoading(true);
      setAiOriginalText(snapshot);
      resetAiState();
      try {
        const res = await apiFetch<{ tags: string[]; existing_tags: Tag[] }>("/ai/tags", {
          method: "POST",
          body: JSON.stringify({ document_id: docId, text: snapshot, max_tags: maxTags }),
        });
        const existingTags = res?.existing_tags || [];
        setAiExistingTags(existingTags);
        setAiRemovedTagIDs([]);
        const selectedNames = new Set(existingTags.map((tag) => tag.name).filter((name): name is string => Boolean(name)));
        const cleaned = (res?.tags || [])
          .map((tag) => normalizeTagName(tag))
          .filter((tag) => isValidTagName(tag))
          .filter((tag, index, arr) => arr.indexOf(tag) === index)
          .filter((tag) => !selectedNames.has(tag));

        setAiSuggestedTags(cleaned);
        const availableSlots = Math.max(0, maxTags - existingTags.length);
        setAiSelectedTags(cleaned.slice(0, availableSlots));
      } catch (err) {
        setAiError(err instanceof Error ? err.message : "AI request failed");
      } finally {
        setAiLoading(false);
      }
    },
    [docId, isValidTagName, maxTags, normalizeTagName, notify, resetAiState]
  );

  const toggleAiTag = useCallback(
    (name: string) => {
      if (aiExistingTagNames.has(name)) return;
      if (aiSelectedTags.includes(name)) {
        setAiSelectedTags(aiSelectedTags.filter((tag) => tag !== name));
        return;
      }
      const existingCount = aiExistingTags.length - aiRemovedTagIDs.length;
      if (existingCount + aiSelectedTags.length >= maxTags) {
        notify(`You can only select up to ${maxTags} tags.`);
        return;
      }
      setAiSelectedTags([...aiSelectedTags, name]);
    },
    [aiExistingTagNames, aiExistingTags.length, aiRemovedTagIDs.length, aiSelectedTags, maxTags, notify]
  );

  const toggleExistingTag = useCallback(
    (tagID: string) => {
      if (aiRemovedTagIDs.includes(tagID)) {
        setAiRemovedTagIDs(aiRemovedTagIDs.filter((id) => id !== tagID));
        return;
      }
      setAiRemovedTagIDs([...aiRemovedTagIDs, tagID]);
    },
    [aiRemovedTagIDs]
  );

  const handleApplyAiSummary = useCallback(
    async ({ onApplied, onError }: ApplyAiSummaryOptions) => {
      if (!aiResultText) {
        closeAiModal();
        return;
      }
      setAiLoading(true);
      try {
        await apiFetch(`/documents/${docId}/summary`, {
          method: "PUT",
          body: JSON.stringify({ summary: aiResultText }),
        });
        onApplied(aiResultText);
        closeAiModal();
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to apply summary");
      } finally {
        setAiLoading(false);
      }
    },
    [aiResultText, closeAiModal, docId]
  );

  const handleApplyAiTags = useCallback(
    async ({ findExistingTagByName, mergeTags, saveTagIDs, onError }: ApplyAiTagsOptions) => {
      if (aiSelectedTags.length === 0 && aiRemovedTagIDs.length === 0) {
        closeAiModal();
        return;
      }

      const keptExisting = aiExistingTags.filter((tag) => !aiRemovedTagIDs.includes(tag.id)).map((tag) => tag.id);
      setAiLoading(true);
      try {
        const nextTagIDs = [...keptExisting];
        const matches = await Promise.all(aiSelectedTags.map((name) => findExistingTagByName(name)));
        const toCreate: string[] = [];

        matches.forEach((tag, index) => {
          if (tag) {
            if (!nextTagIDs.includes(tag.id)) {
              nextTagIDs.push(tag.id);
            }
            return;
          }
          toCreate.push(aiSelectedTags[index]);
        });

        let created: Tag[] = [];
        if (toCreate.length > 0) {
          created = await apiFetch<Tag[]>("/tags/batch", {
            method: "POST",
            body: JSON.stringify({ names: toCreate }),
          });
          created.forEach((tag) => {
            if (!nextTagIDs.includes(tag.id)) {
              nextTagIDs.push(tag.id);
            }
          });
        }

        mergeTags([...(matches.filter(Boolean) as Tag[]), ...created]);
        const finalTagIDs = [...nextTagIDs];
        if (finalTagIDs.length > maxTags) {
          notify(`You can only select up to ${maxTags} tags.`);
          return;
        }

        await saveTagIDs(finalTagIDs);
        closeAiModal();
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to apply tags");
      } finally {
        setAiLoading(false);
      }
    },
    [aiExistingTags, aiRemovedTagIDs, aiSelectedTags, closeAiModal, maxTags, notify]
  );

  return {
    aiModalOpen,
    aiAction,
    aiLoading,
    aiPrompt,
    aiResultText,
    aiExistingTags,
    aiSuggestedTags,
    aiSelectedTags,
    aiRemovedTagIDs,
    aiError,
    aiDiffLines,
    aiTitle,
    aiAvailableSlots,
    setAiPrompt,
    closeAiModal,
    handleAiPolish,
    handleAiGenerateOpen,
    handleAiGenerate,
    handleAiSummary,
    handleAiTags,
    handleApplyAiSummary,
    handleApplyAiTags,
    toggleAiTag,
    toggleExistingTag,
  };
}
