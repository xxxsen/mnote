"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Tag } from "@/types";
import type { AIAction, DiffLine } from "../types";
import { useAiApplyActions } from "./useAiApplyActions";

type UseAiAssistantOptions = {
  docId: string;
  maxTags: number;
  normalizeTagName: (value: string) => string;
  isValidTagName: (value: string) => boolean;
  notify: (message: string) => void;
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

function useAiRequestCoordinator() {
  const requestEpochRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);
  const startRequest = useCallback(() => {
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    return { controller, requestEpoch: ++requestEpochRef.current };
  }, []);
  const cancelRequests = useCallback(() => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    requestEpochRef.current += 1;
  }, []);
  return { requestEpochRef, startRequest, cancelRequests };
}

function normalizeSuggestedTags(
  tags: string[],
  existingTags: Tag[],
  normalize: (value: string) => string,
  isValid: (value: string) => boolean,
) {
  const selectedNames = new Set(existingTags.map((tag) => tag.name).filter(Boolean));
  return tags.map(normalize).filter(isValid)
    .filter((tag, index, values) => values.indexOf(tag) === index)
    .filter((tag) => !selectedNames.has(tag));
}

export function useAiAssistant({ docId, maxTags, normalizeTagName, isValidTagName, notify }: UseAiAssistantOptions) {
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiAction, setAiAction] = useState<AIAction | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiOriginalText, setAiOriginalText] = useState("");
  const [aiResultText, setAiResultText] = useState("");
  const [aiResultReady, setAiResultReady] = useState(false);
  const [aiExistingTags, setAiExistingTags] = useState<Tag[]>([]);
  const [aiSuggestedTags, setAiSuggestedTags] = useState<string[]>([]);
  const [aiSelectedTags, setAiSelectedTags] = useState<string[]>([]);
  const [aiRemovedTagIDs, setAiRemovedTagIDs] = useState<string[]>([]);
  const [aiError, setAiError] = useState<string | null>(null);
  const { requestEpochRef, startRequest, cancelRequests } = useAiRequestCoordinator();

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
    setAiError(null); setAiResultText(""); setAiResultReady(false); setAiExistingTags([]); setAiSuggestedTags([]); setAiSelectedTags([]); setAiRemovedTagIDs([]);
  }, []);

  const updateAiPrompt = useCallback((value: string) => {
    setAiPrompt(value);
    setAiError(null);
    setAiResultText("");
    setAiResultReady(false);
  }, []);

  const closeAiModal = useCallback(() => {
    cancelRequests(); setAiModalOpen(false); setAiAction(null); setAiLoading(false); setAiApplying(false); setAiPrompt(""); setAiOriginalText(""); resetAiState();
  }, [cancelRequests, resetAiState]);

  const runAiTextAction = useCallback(
    async (action: AIAction, snapshot: string, emptyMsg: string, endpoint: string, resultKey: "text" | "summary") => {
      if (!snapshot.trim()) { notify(emptyMsg); return; }
      const { controller, requestEpoch } = startRequest();
      setAiAction(action); setAiModalOpen(true); setAiLoading(true); setAiOriginalText(snapshot); resetAiState();
      try {
        const res = await apiFetch<Record<string, string>>(endpoint, {
          method: "POST", body: JSON.stringify({ text: snapshot }), signal: controller.signal,
        });
        if (requestEpoch === requestEpochRef.current) {
          setAiResultText(res[resultKey] || "");
          setAiResultReady(true);
        }
      } catch (err) {
        if (requestEpoch === requestEpochRef.current) setAiError(err instanceof Error ? err.message : "AI request failed");
      } finally { if (requestEpoch === requestEpochRef.current) { setAiLoading(false); setAiApplying(false); } }
    },
    [notify, requestEpochRef, resetAiState, startRequest],
  );

  const handleAiPolish = useCallback(
    (snapshot: string) => runAiTextAction("polish", snapshot, "Please add some content before polishing.", "/ai/polish", "text"),
    [runAiTextAction],
  );

  const handleAiGenerateOpen = useCallback(() => {
    cancelRequests();
    setAiAction("generate"); setAiModalOpen(true); setAiPrompt(""); setAiOriginalText(""); resetAiState();
  }, [cancelRequests, resetAiState]);

  const handleAiGenerate = useCallback(async () => {
    const prompt = aiPrompt.trim();
    if (!prompt) { setAiError("Please enter a brief description."); return; }
    const { controller, requestEpoch } = startRequest();
    setAiLoading(true); setAiError(null); setAiResultText(""); setAiResultReady(false);
    try {
      const res = await apiFetch<{ text: string }>("/ai/generate", { method: "POST", body: JSON.stringify({ prompt }), signal: controller.signal });
      if (requestEpoch === requestEpochRef.current) {
        setAiResultText(res.text || "");
        setAiResultReady(true);
      }
    } catch (err) {
      if (requestEpoch === requestEpochRef.current) setAiError(err instanceof Error ? err.message : "AI request failed");
    } finally { if (requestEpoch === requestEpochRef.current) { setAiLoading(false); setAiApplying(false); } }
  }, [aiPrompt, requestEpochRef, startRequest]);

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
      const { controller, requestEpoch } = startRequest();
      setAiAction("tags");
      setAiModalOpen(true);
      setAiLoading(true);
      setAiOriginalText(snapshot);
      resetAiState();
      try {
        const res = await apiFetch<{ tags: string[]; existing_tags: Tag[] }>("/ai/tags", {
          method: "POST",
          body: JSON.stringify({ document_id: docId, text: snapshot, max_tags: maxTags }),
          signal: controller.signal,
        });
        const existingTags = res.existing_tags;
        if (requestEpoch !== requestEpochRef.current) return;
        setAiExistingTags(existingTags);
        setAiRemovedTagIDs([]);
        const cleaned = normalizeSuggestedTags(
          res.tags, existingTags, normalizeTagName, isValidTagName,
        );

        setAiSuggestedTags(cleaned);
        const availableSlots = Math.max(0, maxTags - existingTags.length);
        setAiSelectedTags(cleaned.slice(0, availableSlots));
        setAiResultReady(true);
      } catch (err) {
        if (requestEpoch === requestEpochRef.current) setAiError(err instanceof Error ? err.message : "AI request failed");
      } finally {
        if (requestEpoch === requestEpochRef.current) setAiLoading(false);
      }
    },
    [docId, isValidTagName, maxTags, normalizeTagName, notify, requestEpochRef, resetAiState, startRequest]
  );

  const handleAiRetry = useCallback(() => {
    if (aiAction === "generate") return handleAiGenerate();
    if (aiAction === "polish") {
      return runAiTextAction("polish", aiOriginalText, "Please add some content before polishing.", "/ai/polish", "text");
    }
    if (aiAction === "summary") {
      return runAiTextAction("summary", aiOriginalText, "Please add some content before summarizing.", "/ai/summary", "summary");
    }
    if (aiAction === "tags") return handleAiTags(aiOriginalText);
    return undefined;
  }, [aiAction, aiOriginalText, handleAiGenerate, handleAiTags, runAiTextAction]);

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

  const { handleApplyAiSummary, handleApplyAiTags } = useAiApplyActions({
    aiResultText,
    aiExistingTags,
    aiSelectedTags,
    aiRemovedTagIDs,
    docId,
    maxTags,
    notify,
    closeAiModal,
    startRequest,
    requestEpochRef,
    setAiLoading,
    setAiApplying,
  });

  return {
    aiModalOpen, aiAction, aiLoading, aiApplying, aiPrompt, aiResultText, aiResultReady,
    aiExistingTags, aiSuggestedTags, aiSelectedTags, aiRemovedTagIDs,
    aiError, aiDiffLines, aiTitle, aiAvailableSlots, setAiPrompt: updateAiPrompt,
    closeAiModal, handleAiPolish, handleAiGenerateOpen, handleAiGenerate, handleAiRetry,
    handleAiSummary, handleAiTags, handleApplyAiSummary, handleApplyAiTags,
    toggleAiTag, toggleExistingTag,
  };
}
