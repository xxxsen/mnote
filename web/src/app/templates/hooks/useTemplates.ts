"use client";

import { useCallback, useEffect, useMemo, useState, type UIEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import type { Template, TemplateMeta, TemplateMetaPage, Document } from "@/types";
import type { TemplateDraft } from "../types";
import { emptyDraft } from "../types";
import { VARIABLE_REGEX, TEMPLATE_META_PAGE_LIMIT, normalizeTemplatePlaceholders, resolveSystemVariableClient } from "../utils";
import { useTemplateTags } from "./useTemplateTags";

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

  const tags = useTemplateTags(selectedTemplate);
  const selected = useMemo(() => templates.find((item) => item.id === selectedID) || null, [selectedID, templates]);

  const detectedVariables = useMemo(() => {
    const text = draft.content || "";
    const result: string[] = [];
    const seen = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = VARIABLE_REGEX.exec(text)) !== null) {
      const key = (match[1] || "").trim().toUpperCase();
      if (!key || seen.has(key)) continue;
      seen.add(key); result.push(key);
    }
    VARIABLE_REGEX.lastIndex = 0;
    return result;
  }, [draft.content]);

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
        setSelectedID((prev) => {
          if (next.length === 0) return "";
          if (!prev) return next[0].id;
          if (next.find((item) => item.id === prev)) return prev;
          return next[0].id;
        });
      } else if (next.length > 0) {
        setTemplates((prev) => {
          const existing = new Set(prev.map((item) => item.id));
          const merged = [...prev];
          next.forEach((item) => { if (!existing.has(item.id)) merged.push(item); });
          return merged;
        });
      }
    } catch (err) {
      toast({ description: err instanceof Error ? err.message : "Failed to load templates", variant: "error" });
    } finally {
      if (reset) setLoading(false); else setLoadingMore(false);
    }
  }, [toast]);

  useEffect(() => { void loadTemplates(0, true); }, [loadTemplates]);

  const handleTemplateListScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    if (loading || loadingMore) return;
    if (templates.length >= templatesTotal) return;
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 48) void loadTemplates(templates.length, false);
  }, [loadTemplates, loading, loadingMore, templates.length, templatesTotal]);

  useEffect(() => {
    const loadSelected = async () => {
      if (!selectedID) { setSelectedTemplate(null); return; }
      try { setSelectedTemplate(await apiFetch<Template>(`/templates/${selectedID}`)); }
      catch (err) { toast({ description: err instanceof Error ? err.message : "Failed to load template detail", variant: "error" }); setSelectedTemplate(null); }
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
      if (normalizedDraftContent !== draft.content) setDraft((prev) => ({ ...prev, content: normalizedDraftContent }));
      setSelectedTemplate((prev) =>
        prev ? { ...prev, name: draft.name, description: draft.description, content: normalizedDraftContent, default_tag_ids: [...tags.selectedTagIDs], mtime: Math.floor(Date.now() / 1000) } : prev
      );
      toast({ description: "Template saved." });
      await loadTemplates(0, true);
      setSelectedID(selectedTemplate.id);
      return true;
    } catch (err) {
      toast({ description: err instanceof Error ? err.message : "Failed to save template", variant: "error" });
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
    } catch (err) { toast({ description: err instanceof Error ? err.message : "Failed to create template", variant: "error" }); }
  };

  const deleteTemplate = async (templateID: string, templateName: string) => {
    if (!window.confirm(`Delete template "${templateName}"?`)) return;
    try {
      await apiFetch(`/templates/${templateID}`, { method: "DELETE" });
      toast({ description: "Template deleted." });
      await loadTemplates(0, true);
      if (selectedID === templateID) setSelectedID("");
    } catch (err) { toast({ description: err instanceof Error ? err.message : "Failed to delete template", variant: "error" }); }
  };

  /* v8 ignore start -- async imperative flow with save-before-use logic is difficult to unit test */
  const prepareUseTemplate = () => {
    if (!selected || !selectedTemplate) return;
    void (async () => {
      const nc = normalizeTemplatePlaceholders(draft.content);
      if (nc !== draft.content) setDraft((prev) => ({ ...prev, content: nc }));
      const changed = draft.name !== (selectedTemplate.name || "") || draft.description !== (selectedTemplate.description || "") || nc !== (selectedTemplate.content || "");
      if (changed) { if (!(await saveTemplate())) return; }
      const fillable = detectedVariables.filter((key) => !key.startsWith("SYS:"));
      const initial: Record<string, string> = {};
      fillable.forEach((key) => { initial[key] = ""; });
      setVariableValues(initial);
      setShowVariableModal(true);
    })();
  };
  /* v8 ignore stop */

  const createFromTemplate = async (variables: Record<string, string>) => {
    if (!selected) return;
    setCreatingDoc(true);
    try {
      const doc = await apiFetch<Document>(`/templates/${selected.id}/create`, { method: "POST", body: JSON.stringify({ variables }) });
      router.push(`/docs/${doc.id}`);
    } catch (err) { toast({ description: err instanceof Error ? err.message : "Failed to create note from template", variant: "error" }); }
    finally { setCreatingDoc(false); setShowVariableModal(false); }
  };

  const previewContent = useMemo(() => {
    return normalizeTemplatePlaceholders(draft.content).replace(VARIABLE_REGEX, (_raw, key: string) => {
      const normalized = (key || "").trim().toUpperCase();
      if (!normalized) return "";
      if (normalized.startsWith("SYS:")) return resolveSystemVariableClient(normalized);
      return variableValues[normalized] || "";
    });
  }, [draft.content, variableValues]);

  return {
    router, templates: filteredTemplates, templatesTotal, loading, loadingMore,
    selectedID, setSelectedID, selected, draft, setDraft, creatingDoc,
    showVariableModal, setShowVariableModal, variableValues, setVariableValues,
    search, setSearch,
    selectedTagIDs: tags.selectedTagIDs, setSelectedTagIDs: tags.setSelectedTagIDs,
    visibleSelectedTags: tags.visibleSelectedTags,
    tagQuery: tags.tagQuery, setTagQuery: tags.setTagQuery,
    showTagInput: tags.showTagInput, setShowTagInput: tags.setShowTagInput,
    isSaveDisabled, handleTemplateListScroll,
    createTemplate, saveTemplate, addTag: tags.addTag,
    deleteTemplate, prepareUseTemplate, createFromTemplate, previewContent,
  };
}
