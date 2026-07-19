"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";
import type { Template } from "@/types";
import type { TemplateDraft } from "../types";
import { emptyDraft } from "../types";
import { normalizeTemplatePlaceholders } from "../utils";
import { useTemplateTags } from "./useTemplateTags";

type Toast = (input: {
  description: string;
  variant?: "default" | "success" | "error";
}) => void;

function sameIDs(left: string[], right: string[]) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function isTemplateDirty(
  template: Template | null,
  draft: TemplateDraft,
  normalizedContent: string,
  selectedTagIDs: string[],
) {
  if (!template) return false;
  return (
    draft.name !== (template.name || "")
    || draft.description !== (template.description || "")
    || normalizedContent !== (template.content || "")
    || !sameIDs(selectedTagIDs, template.default_tag_ids)
  );
}

export function useTemplateEditor({
  selectedID,
  toast,
  onSaved,
}: {
  selectedID: string;
  toast: Toast;
  onSaved: () => Promise<unknown>;
}) {
  const [loaded, setLoaded] = useState<{ id: string; template: Template } | null>(null);
  const [draft, setDraft] = useState<TemplateDraft>(emptyDraft);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailRequestVersion, setDetailRequestVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const savingRef = useRef(false);
  const selectedTemplate = loaded?.id === selectedID ? loaded.template : null;
  const tags = useTemplateTags(selectedTemplate);

  useEffect(() => {
    abortRef.current?.abort();
    if (!selectedID) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const requestID = requestRef.current + 1;
    requestRef.current = requestID;
    const load = async () => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const template = await apiFetch<Template>(
          `/templates/${selectedID}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted || requestRef.current !== requestID) return;
        setLoaded({ id: selectedID, template });
        setDraft({
          name: template.name || "",
          description: template.description || "",
          content: template.content || "",
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "Failed to load template detail";
        setDetailError(message);
        toast({ description: message, variant: "error" });
      } finally {
        if (requestRef.current === requestID) setDetailLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [detailRequestVersion, selectedID, toast]);

  const normalizedDraftContent = useMemo(
    () => normalizeTemplatePlaceholders(draft.content),
    [draft.content],
  );
  const isDirty = isTemplateDirty(
    selectedTemplate,
    draft,
    normalizedDraftContent,
    tags.selectedTagIDs,
  );

  const saveTemplate = async () => {
    if (!selectedTemplate || savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    try {
      await apiFetch(`/templates/${selectedTemplate.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: draft.name,
          description: draft.description,
          content: normalizedDraftContent,
          default_tag_ids: tags.selectedTagIDs,
        }),
      });
      const updated = {
        ...selectedTemplate,
        name: draft.name,
        description: draft.description,
        content: normalizedDraftContent,
        default_tag_ids: [...tags.selectedTagIDs],
        mtime: Math.floor(Date.now() / 1000),
      };
      setLoaded({ id: selectedTemplate.id, template: updated });
      setDraft((previous) => ({ ...previous, content: normalizedDraftContent }));
      await onSaved();
      toast({ description: "Template saved.", variant: "success" });
      return true;
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : "Failed to save template",
        variant: "error",
      });
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return {
    selectedTemplate,
    draft,
    setDraft,
    detailLoading,
    detailError,
    retryDetail: () => setDetailRequestVersion((version) => version + 1),
    saving,
    isDirty,
    isSaveDisabled: !isDirty || saving,
    saveTemplate,
    selectedTagIDs: tags.selectedTagIDs,
    setSelectedTagIDs: tags.setSelectedTagIDs,
    visibleSelectedTags: tags.visibleSelectedTags,
    tagQuery: tags.tagQuery,
    setTagQuery: tags.setTagQuery,
    showTagInput: tags.showTagInput,
    setShowTagInput: tags.setShowTagInput,
    addTag: tags.addTag,
  };
}
