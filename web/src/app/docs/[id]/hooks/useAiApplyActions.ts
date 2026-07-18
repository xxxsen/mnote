"use client";

import { useCallback, useRef } from "react";

import { apiFetch } from "@/lib/api";
import type { Tag } from "@/types";

type RequestStart = () => {
  controller: AbortController;
  requestEpoch: number;
};

type UseAiApplyActionsOptions = {
  aiResultText: string;
  aiExistingTags: Tag[];
  aiSelectedTags: string[];
  aiRemovedTagIDs: string[];
  docId: string;
  maxTags: number;
  notify: (message: string) => void;
  closeAiModal: () => void;
  startRequest: RequestStart;
  requestEpochRef: { current: number };
  setAiLoading: (value: boolean) => void;
  setAiApplying: (value: boolean) => void;
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

async function resolveAiTagCreation(
  selectedTags: string[],
  findExistingTagByName: (name: string) => Promise<Tag | null>,
): Promise<{ matched: Tag[]; toCreate: string[] }> {
  const matches = await Promise.all(selectedTags.map((name) => findExistingTagByName(name)));
  const matched: Tag[] = [];
  const toCreate: string[] = [];
  matches.forEach((tag, index) => {
    if (tag) matched.push(tag);
    else toCreate.push(selectedTags[index]);
  });
  return { matched, toCreate };
}

export function useAiApplyActions(options: UseAiApplyActionsOptions) {
  const {
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
  } = options;
  const applyingRef = useRef(false);

  const handleApplyAiSummary = useCallback(
    async ({ onApplied, onError }: ApplyAiSummaryOptions) => {
      if (applyingRef.current) return;
      if (!aiResultText) {
        closeAiModal();
        return;
      }
      applyingRef.current = true;
      const { controller, requestEpoch } = startRequest();
      setAiLoading(true);
      setAiApplying(true);
      try {
        await apiFetch(`/documents/${docId}/summary`, {
          method: "PUT",
          body: JSON.stringify({ summary: aiResultText }),
          signal: controller.signal,
        });
        onApplied(aiResultText);
        if (requestEpoch === requestEpochRef.current) closeAiModal();
      } catch (error) {
        if (requestEpoch === requestEpochRef.current) {
          onError(error instanceof Error ? error.message : "Failed to apply summary");
        }
      } finally {
        applyingRef.current = false;
        if (requestEpoch === requestEpochRef.current) {
          setAiLoading(false);
          setAiApplying(false);
        }
      }
    },
    [
      aiResultText,
      closeAiModal,
      docId,
      requestEpochRef,
      setAiApplying,
      setAiLoading,
      startRequest,
    ],
  );

  const handleApplyAiTags = useCallback(
    async ({ findExistingTagByName, mergeTags, saveTagIDs, onError }: ApplyAiTagsOptions) => {
      if (applyingRef.current) return;
      if (aiSelectedTags.length === 0 && aiRemovedTagIDs.length === 0) {
        closeAiModal();
        return;
      }
      applyingRef.current = true;
      const keptExisting = aiExistingTags
        .filter((tag) => !aiRemovedTagIDs.includes(tag.id))
        .map((tag) => tag.id);
      const { controller, requestEpoch } = startRequest();
      setAiLoading(true);
      setAiApplying(true);
      try {
        const nextTagIDs = [...keptExisting];
        const { matched, toCreate } = await resolveAiTagCreation(
          aiSelectedTags,
          findExistingTagByName,
        );
        controller.signal.throwIfAborted();

        matched.forEach((tag) => {
          if (!nextTagIDs.includes(tag.id)) nextTagIDs.push(tag.id);
        });

        const created = toCreate.length > 0
          ? await apiFetch<Tag[]>("/tags/batch", {
              method: "POST",
              body: JSON.stringify({ names: toCreate }),
              signal: controller.signal,
            })
          : [];
        created.forEach((tag) => {
          if (!nextTagIDs.includes(tag.id)) nextTagIDs.push(tag.id);
        });
        mergeTags([...matched, ...created]);

        if (nextTagIDs.length > maxTags) {
          notify(`You can only select up to ${maxTags} tags.`);
          return;
        }
        controller.signal.throwIfAborted();
        await saveTagIDs(nextTagIDs);
        if (requestEpoch === requestEpochRef.current) closeAiModal();
      } catch (error) {
        if (requestEpoch === requestEpochRef.current) {
          onError(error instanceof Error ? error.message : "Failed to apply tags");
        }
      } finally {
        applyingRef.current = false;
        if (requestEpoch === requestEpochRef.current) {
          setAiLoading(false);
          setAiApplying(false);
        }
      }
    },
    [
      aiExistingTags,
      aiRemovedTagIDs,
      aiSelectedTags,
      closeAiModal,
      maxTags,
      notify,
      requestEpochRef,
      setAiApplying,
      setAiLoading,
      startRequest,
    ],
  );

  return { handleApplyAiSummary, handleApplyAiTags };
}
