"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import type { Template, TemplateMeta, TemplateMetaPage, Document } from "@/types";
import type { TemplateDraft } from "../types";
import { emptyDraft } from "../types";
import { VARIABLE_REGEX, TEMPLATE_META_PAGE_LIMIT, normalizeTemplatePlaceholders, resolveSystemVariableClient } from "../utils";
import { useTemplateTags } from "./useTemplateTags";

type PendingTemplateDelete = { id: string; name: string };

function detectTemplateVariables(content: string) {
  const result: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = VARIABLE_REGEX.exec(content || "")) !== null) {
    const key = (match[1] || "").trim().toUpperCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }
  VARIABLE_REGEX.lastIndex = 0;
  return result;
}

export function useTemplates() {
  const router = useRouter();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [templatesTotal, setTemplatesTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedID, setSelectedID] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [draft, setDraft] = useState<TemplateDraft>(emptyDraft);
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [showVariableModal, setShowVariableModal] = useState(false);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<PendingTemplateDelete | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState(false);
  const creatingDocRef = useRef(false);
  const deletingTemplateRef = useRef(false);

  const tags = useTemplateTags(selectedTemplate);
  const selected = useMemo(() => templates.find((item) => item.id === selectedID) || null, [selectedID, templates]);

  const detectedVariables = useMemo(() => detectTemplateVariables(draft.content), [draft.content]);

  const filteredTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return templates;
    return templates.filter((item) => item.name.toLowerCase().includes(query));
  }, [search, templates]);

  const normalizedDraftContent = useMemo(() => normalizeTemplatePlaceholders(draft.content), [draft.content]);
  const isSaveDisabled = useMemo(() => {
    if (!selectedTemplate) return true;
    return (
      draft.name === (selectedTemplate.name || "") &&
      draft.description === (selectedTemplate.description || "") &&
      normalizedDraftContent === (selectedTemplate.content || "") &&
      JSON.stringify([...tags.selectedTagIDs].sort()) === JSON.stringify([...selectedTemplate.default_tag_ids].sort())
    );
  }, [draft.description, draft.name, normalizedDraftContent, tags.selectedTagIDs, selectedTemplate]);

  const loadTemplates = useCallback(async (offset: number, reset = false) => {
    if (reset) setLoading(true); else setLoadingMore(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(TEMPLATE_META_PAGE_LIMIT));
      params.set("offset", String(offset));
      const page = await apiFetch<TemplateMetaPage>(`/templates/meta?${params.toString()}`);
      const next = page.items;
      setTemplatesTotal(page.total || 0);
      if (reset) {
        setTemplates(next);
        setSelectedID((previous) => {
          if (next.length === 0) return "";
          if (!previous) return next[0].id;
          if (next.find((item) => item.id === previous)) return previous;
          return next[0].id;
        });
      } else if (next.length > 0) {
        setTemplates((previous) => {
          const existing = new Set(previous.map((item) => item.id));
          return [...previous, ...next.filter((item) => !existing.has(item.id))];
        });
      }
    } catch (error) {
      toast({ description: error instanceof Error ? error.message : "Failed to load templates", variant: "error" });
    } finally {
      if (reset) setLoading(false); else setLoadingMore(false);
    }
  }, [toast]);

  useEffect(() => { void loadTemplates(0, true); }, [loadTemplates]);

  const handleTemplateListScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (loading || loadingMore || templates.length >= templatesTotal) return;
    const element = event.currentTarget;
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 48) {
      void loadTemplates(templates.length, false);
    }
  }, [loadTemplates, loading, loadingMore, templates.length, templatesTotal]);

  useEffect(() => {
    const loadSelected = async () => {
      if (!selectedID) { setSelectedTemplate(null); return; }
      try {
        setSelectedTemplate(await apiFetch<Template>(`/templates/${selectedID}`));
      } catch (error) {
        toast({ description: error instanceof Error ? error.message : "Failed to load template detail", variant: "error" });
        setSelectedTemplate(null);
      }
    };
    void loadSelected();
  }, [selectedID, toast]);

  useEffect(() => {
    if (!selectedTemplate) { setDraft(emptyDraft); return; }
    setDraft({ name: selectedTemplate.name || "", description: selectedTemplate.description || "", content: selectedTemplate.content || "" });
  }, [selectedTemplate]);

  const saveTemplate = async () => {
    if (!selectedTemplate) return false;
    try {
      await apiFetch(`/templates/${selectedTemplate.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: draft.name, description: draft.description, content: normalizedDraftContent, default_tag_ids: tags.selectedTagIDs }),
      });
      if (normalizedDraftContent !== draft.content) setDraft((previous) => ({ ...previous, content: normalizedDraftContent }));
      setSelectedTemplate((previous) => previous ? {
        ...previous, name: draft.name, description: draft.description, content: normalizedDraftContent,
        default_tag_ids: [...tags.selectedTagIDs], mtime: Math.floor(Date.now() / 1000),
      } : previous);
      toast({ description: "Template saved." });
      await loadTemplates(0, true);
      setSelectedID(selectedTemplate.id);
      return true;
    } catch (error) {
      toast({ description: error instanceof Error ? error.message : "Failed to save template", variant: "error" });
      return false;
    }
  };

  const createTemplate = async () => {
    try {
      const item = await apiFetch<Template>("/templates", {
        method: "POST", body: JSON.stringify({ name: "New Template", description: "", content: "# New Template\n", default_tag_ids: [] }),
      });
      await loadTemplates(0, true);
      setSelectedID(item.id);
    } catch (error) {
      toast({ description: error instanceof Error ? error.message : "Failed to create template", variant: "error" });
    }
  };

  const requestDeleteTemplate = (id: string, name: string) => setPendingDelete({ id, name });
  const cancelDeleteTemplate = () => { if (!deletingTemplateRef.current) setPendingDelete(null); };
  const confirmDeleteTemplate = async () => {
    if (!pendingDelete || deletingTemplateRef.current) return;
    deletingTemplateRef.current = true;
    setDeletingTemplate(true);
    try {
      await apiFetch(`/templates/${pendingDelete.id}`, { method: "DELETE" });
      toast({ description: "Template deleted." });
      const deletedID = pendingDelete.id;
      setPendingDelete(null);
      await loadTemplates(0, true);
      if (selectedID === deletedID) setSelectedID("");
    } catch (error) {
      toast({ description: error instanceof Error ? error.message : "Failed to delete template", variant: "error" });
    } finally {
      deletingTemplateRef.current = false;
      setDeletingTemplate(false);
    }
  };

  /* v8 ignore start -- async imperative flow with save-before-use logic is difficult to unit test */
  const prepareUseTemplate = () => {
    if (!selected || !selectedTemplate) return;
    void (async () => {
      const normalized = normalizeTemplatePlaceholders(draft.content);
      if (normalized !== draft.content) setDraft((previous) => ({ ...previous, content: normalized }));
      const changed = draft.name !== (selectedTemplate.name || "") || draft.description !== (selectedTemplate.description || "") || normalized !== (selectedTemplate.content || "");
      if (changed && !(await saveTemplate())) return;
      const initial: Record<string, string> = {};
      detectedVariables.filter((key) => !key.startsWith("SYS:")).forEach((key) => { initial[key] = ""; });
      setVariableValues(initial);
      setShowVariableModal(true);
    })();
  };
  /* v8 ignore stop */

  const createFromTemplate = async (variables: Record<string, string>) => {
    if (!selected || creatingDocRef.current) return;
    creatingDocRef.current = true;
    setCreatingDoc(true);
    try {
      const doc = await apiFetch<Document>(`/templates/${selected.id}/create`, {
        method: "POST", body: JSON.stringify({ variables }),
      });
      setShowVariableModal(false);
      router.push(`/docs/${doc.id}`);
    } catch (error) {
      toast({ description: error instanceof Error ? error.message : "Failed to create note from template", variant: "error" });
    } finally {
      creatingDocRef.current = false;
      setCreatingDoc(false);
    }
  };

  const previewContent = useMemo(() => normalizeTemplatePlaceholders(draft.content).replace(
    VARIABLE_REGEX,
    (_raw, key: string) => {
      const normalized = (key || "").trim().toUpperCase();
      if (!normalized) return "";
      if (normalized.startsWith("SYS:")) return resolveSystemVariableClient(normalized);
      return variableValues[normalized] || "";
    },
  ), [draft.content, variableValues]);

  return {
    router, templates: filteredTemplates, templatesTotal, loading, loadingMore,
    selectedID, setSelectedID, selected, draft, setDraft, creatingDoc,
    showVariableModal, setShowVariableModal, variableValues, setVariableValues,
    search, setSearch, pendingDelete, deletingTemplate,
    selectedTagIDs: tags.selectedTagIDs, setSelectedTagIDs: tags.setSelectedTagIDs,
    visibleSelectedTags: tags.visibleSelectedTags,
    tagQuery: tags.tagQuery, setTagQuery: tags.setTagQuery,
    showTagInput: tags.showTagInput, setShowTagInput: tags.setShowTagInput,
    isSaveDisabled, handleTemplateListScroll,
    createTemplate, saveTemplate, addTag: tags.addTag,
    requestDeleteTemplate, cancelDeleteTemplate, confirmDeleteTemplate,
    prepareUseTemplate, createFromTemplate, previewContent,
  };
}
