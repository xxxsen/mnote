"use client";

import { useCallback, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Tag } from "@/types";
import type { AIAction, DiffLine } from "../types";

async function resolveAiTagCreation(
  selectedTags: string[],
  findExistingTagByName: (name: string) => Promise<Tag | null>,
): Promise<{ matched: Tag[]; toCreate: string[] }> {
  const matches = await Promise.all(selectedTags.map((name) => findExistingTagByName(name)));
  const matched: Tag[] = [];
  const toCreate: string[] = [];
  matches.forEach((tag, index) => {
    if (tag) {
      matched.push(tag);
    } else {
      toCreate.push(selectedTags[index]);
    }
  });
  return { matched, toCreate };
}

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
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

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

  const aiExistingTagNames = useMemo(
    () => new Set(aiExistingTags.map((t) => t.name).filter(Boolean)),
    [aiExistingTags],
  );

  const AI_TITLES: Record<string, string> = { polish: "AI Polish", generate: "AI Generate", summary: "AI Summary", tags: "AI Tags" };
  const aiTitle = (aiAction && AI_TITLES[aiAction]) || "AI Tags";

  const aiExistingCount = Math.max(0, aiExistingTags.length - aiRemovedTagIDs.length);
  const aiAvailableSlots = Math.max(0, maxTags - aiExistingCount);

  const resetAiState = useCallback(() => {
    setAiError(null); setAiResultText(""); setAiExistingTags([]); setAiSuggestedTags([]); setAiSelectedTags([]); setAiRemovedTagIDs([]);
  }, []);

  const closeAiModal = useCallback(() => {
    setAiModalOpen(false); setAiAction(null); setAiLoading(false); setAiPrompt(""); setAiOriginalText(""); resetAiState();
  }, [resetAiState]);

  const runAiTextAction = useCallback(
    async (action: AIAction, snapshot: string, emptyMsg: string, endpoint: string, resultKey: string) => {
      if (!snapshot.trim()) { notify(emptyMsg); return; }
      setAiAction(action);
      setAiModalOpen(true);
      setAiLoading(true);
      setAiOriginalText(snapshot);
      resetAiState();
      try {
        const res = await apiFetch<Record<string, string>>(endpoint, {
          method: "POST", body: JSON.stringify({ text: snapshot }),
        });
        setAiResultText(res[resultKey] || "");
      } catch (err) {
        setAiError(err instanceof Error ? err.message : "AI request failed");
      } finally { setAiLoading(false); }
    },
    [notify, resetAiState],
  );

  const handleAiPolish = useCallback(
    (snapshot: string) => runAiTextAction("polish", snapshot, "Please add some content before polishing.", "/ai/polish", "text"),
    [runAiTextAction],
  );

  const handleAiGenerateOpen = useCallback(() => {
    setAiAction("generate"); setAiModalOpen(true); setAiPrompt(""); setAiOriginalText(""); resetAiState();
  }, [resetAiState]);

  const handleAiGenerate = useCallback(async () => {
    const prompt = aiPrompt.trim();
    if (!prompt) { setAiError("Please enter a brief description."); return; }
    setAiLoading(true); setAiError(null);
    try {
      const res = await apiFetch<{ text: string }>("/ai/generate", { method: "POST", body: JSON.stringify({ prompt }) });
      setAiResultText(res.text || "");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI request failed");
    } finally { setAiLoading(false); }
  }, [aiPrompt]);

  const handleAiSummary = useCallback(
    (snapshot: string) => runAiTextAction("summary", snapshot, "Please add some content before summarizing.", "/ai/summary", "summary"),
    [runAiTextAction],
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
        const existingTags = res.existing_tags;
        setAiExistingTags(existingTags);
        setAiRemovedTagIDs([]);
        const selectedNames = new Set(existingTags.map((tag) => tag.name).filter((name): name is string => Boolean(name)));
        const cleaned = res.tags
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
        await apiFetch(`/documents/${docId}/summary`, { method: "PUT", body: JSON.stringify({ summary: aiResultText }) });
        onApplied(aiResultText); closeAiModal();
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to apply summary");
      } finally { setAiLoading(false);
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
        const { matched, toCreate } = await resolveAiTagCreation(aiSelectedTags, findExistingTagByName);

        matched.forEach((tag) => {
          if (!nextTagIDs.includes(tag.id)) nextTagIDs.push(tag.id);
        });

        let created: Tag[] = [];
        if (toCreate.length > 0) {
          created = await apiFetch<Tag[]>("/tags/batch", {
            method: "POST",
            body: JSON.stringify({ names: toCreate }),
          });
          created.forEach((tag) => {
            if (!nextTagIDs.includes(tag.id)) nextTagIDs.push(tag.id);
          });
        }

        mergeTags([...matched, ...created]);
        if (nextTagIDs.length > maxTags) {
          notify(`You can only select up to ${maxTags} tags.`);
          return;
        }

        await saveTagIDs(nextTagIDs);
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
    aiModalOpen, aiAction, aiLoading, aiPrompt, aiResultText,
    aiExistingTags, aiSuggestedTags, aiSelectedTags, aiRemovedTagIDs,
    aiError, aiDiffLines, aiTitle, aiAvailableSlots, setAiPrompt,
    closeAiModal, handleAiPolish, handleAiGenerateOpen, handleAiGenerate,
    handleAiSummary, handleAiTags, handleApplyAiSummary, handleApplyAiTags,
    toggleAiTag, toggleExistingTag,
  };
}
