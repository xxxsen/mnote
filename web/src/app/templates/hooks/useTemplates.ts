"use client";

import { useCallback, useEffect, useMemo, useState, type UIEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import type { Template, TemplateMeta, TemplateMetaPage, Document, Tag } from "@/types";
import type { TemplateDraft } from "../types";
import { emptyDraft } from "../types";
import {
  VARIABLE_REGEX,
  TEMPLATE_META_PAGE_LIMIT,
  MAX_TAGS,
  TAG_NAME_REGEX,
  normalizeTemplatePlaceholders,
  resolveSystemVariableClient,
} from "../utils";

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
  const [selectedTagIDs, setSelectedTagIDs] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);

  const selected = useMemo(() => templates.find((item) => item.id === selectedID) || null, [selectedID, templates]);
  const tagMap = useMemo(() => {
    const map: Record<string, Tag> = {};
    allTags.forEach((tag) => { map[tag.id] = tag; });
    return map;
  }, [allTags]);
  const visibleSelectedTags = useMemo(
    () => selectedTagIDs.map((id) => tagMap[id]).filter(Boolean) as Tag[],
    [selectedTagIDs, tagMap]
  );
  const detectedVariables = useMemo(() => {
    const text = draft.content || "";
    const result: string[] = [];
    const seen = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = VARIABLE_REGEX.exec(text)) !== null) {
      const key = (match[1] || "").trim().toUpperCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(key);
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
      JSON.stringify([...selectedTagIDs].sort()) === JSON.stringify([...(selectedTemplate.default_tag_ids || [])].sort())
    );
  }, [draft.description, draft.name, normalizedDraftContent, selectedTagIDs, selectedTemplate]);

  const loadTemplates = useCallback(async (offset: number, reset = false) => {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const params = new URLSearchParams();
      params.set("limit", String(TEMPLATE_META_PAGE_LIMIT));
      params.set("offset", String(offset));
      const page = await apiFetch<TemplateMetaPage>(`/templates/meta?${params.toString()}`);
      const next = page?.items || [];
      setTemplatesTotal(page?.total || 0);

      if (reset) {
        setTemplates(next);
        setSelectedID((prev) => {
          if (next.length === 0) return "";
          if (!prev) return next[0].id;
          if (next.find((item) => item.id === prev)) return prev;
          return next[0].id;
        });
        return;
      }

      if (next.length > 0) {
        setTemplates((prev) => {
          const existing = new Set(prev.map((item) => item.id));
          const merged = [...prev];
          next.forEach((item) => {
            if (!existing.has(item.id)) merged.push(item);
          });
          return merged;
        });
      }
    } catch (err) {
      toast({ description: err instanceof Error ? err.message : "Failed to load templates", variant: "error" });
    } finally {
      if (reset) { setLoading(false); } else { setLoadingMore(false); }
    }
  }, [toast]);

  useEffect(() => {
    void loadTemplates(0, true);
  }, [loadTemplates]);

  const handleTemplateListScroll = useCallback(
    (e: UIEvent<HTMLDivElement>) => {
      if (loading || loadingMore) return;
      if (templates.length >= templatesTotal) return;
      const el = e.currentTarget;
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 48;
      if (nearBottom) void loadTemplates(templates.length, false);
    },
    [loadTemplates, loading, loadingMore, templates.length, templatesTotal]
  );

  useEffect(() => {
    const loadSelectedTemplate = async () => {
      if (!selectedID) { setSelectedTemplate(null); return; }
      try {
        const item = await apiFetch<Template>(`/templates/${selectedID}`);
        setSelectedTemplate(item);
      } catch (err) {
        toast({ description: err instanceof Error ? err.message : "Failed to load template detail", variant: "error" });
        setSelectedTemplate(null);
      }
    };
    void loadSelectedTemplate();
  }, [selectedID, toast]);

  useEffect(() => {
    if (!selectedTemplate) {
      setDraft(emptyDraft);
      setSelectedTagIDs([]);
      setShowTagInput(false);
      return;
    }
    setDraft({
      name: selectedTemplate.name || "",
      description: selectedTemplate.description || "",
      content: selectedTemplate.content || "",
    });
    setSelectedTagIDs(selectedTemplate.default_tag_ids || []);
    setShowTagInput(false);
  }, [selectedTemplate]);

  useEffect(() => {
    const missingIDs = selectedTagIDs.filter((id) => !allTags.some((tag) => tag.id === id));
    if (missingIDs.length === 0) return;
    const loadMissingTags = async () => {
      try {
        const items = await apiFetch<Tag[]>("/tags/ids", {
          method: "POST",
          body: JSON.stringify({ ids: missingIDs }),
        });
        if (!items || items.length === 0) return;
        setAllTags((prev) => {
          const map = new Map(prev.map((tag) => [tag.id, tag] as const));
          items.forEach((tag) => map.set(tag.id, tag));
          return Array.from(map.values());
        });
      } catch {
        // Ignore silently; unresolved/deleted tags stay hidden in UI.
      }
    };
    void loadMissingTags();
  }, [allTags, selectedTagIDs]);

  const createTemplate = async () => {
    try {
      const item = await apiFetch<Template>("/templates", {
        method: "POST",
        body: JSON.stringify({ name: "New Template", description: "", content: "# New Template\n", default_tag_ids: [] }),
      });
      await loadTemplates(0, true);
      setSelectedID(item.id);
    } catch (err) {
      toast({ description: err instanceof Error ? err.message : "Failed to create template", variant: "error" });
    }
  };

  const saveTemplate = async () => {
    if (!selectedTemplate) return false;
    const normalizedContent = normalizedDraftContent;
    try {
      await apiFetch(`/templates/${selectedTemplate.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: draft.name, description: draft.description, content: normalizedContent, default_tag_ids: selectedTagIDs }),
      });
      if (normalizedContent !== draft.content) {
        setDraft((prev) => ({ ...prev, content: normalizedContent }));
      }
      setSelectedTemplate((prev) =>
        prev
          ? { ...prev, name: draft.name, description: draft.description, content: normalizedContent, default_tag_ids: [...selectedTagIDs], mtime: Math.floor(Date.now() / 1000) }
          : prev
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

  const addTag = async (nameOrTag: string | Tag) => {
    if (selectedTagIDs.length >= MAX_TAGS) {
      toast({ description: `You can only select up to ${MAX_TAGS} tags.` });
      return;
    }
    if (typeof nameOrTag !== "string") {
      if (!selectedTagIDs.includes(nameOrTag.id)) {
        setSelectedTagIDs((prev) => [...prev, nameOrTag.id]);
      }
      setTagQuery("");
      setShowTagInput(false);
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
      setTagQuery("");
      setShowTagInput(false);
    } catch (err) {
      try {
        const params = new URLSearchParams();
        params.set("q", name);
        params.set("limit", "10");
        const found = await apiFetch<Tag[]>(`/tags?${params.toString()}`);
        const existing = (found || []).find((tag) => tag.name === name) || null;
        if (existing) {
          setAllTags((prev) => {
            if (prev.some((tag) => tag.id === existing.id)) return prev;
            return [...prev, existing];
          });
          if (!selectedTagIDs.includes(existing.id)) {
            setSelectedTagIDs((prev) => [...prev, existing.id]);
          }
          setTagQuery("");
          setShowTagInput(false);
          return;
        }
      } catch {
        // ignore and show original error below
      }
      toast({ description: err instanceof Error ? err.message : "Failed to create tag", variant: "error" });
    }
  };

  const deleteTemplate = async (templateID: string, templateName: string) => {
    const ok = window.confirm(`Delete template "${templateName}"?`);
    if (!ok) return;
    try {
      await apiFetch(`/templates/${templateID}`, { method: "DELETE" });
      toast({ description: "Template deleted." });
      await loadTemplates(0, true);
      if (selectedID === templateID) setSelectedID("");
    } catch (err) {
      toast({ description: err instanceof Error ? err.message : "Failed to delete template", variant: "error" });
    }
  };

  const prepareUseTemplate = () => {
    if (!selected || !selectedTemplate) return;
    void (async () => {
      const normalizedContent = normalizeTemplatePlaceholders(draft.content);
      if (normalizedContent !== draft.content) {
        setDraft((prev) => ({ ...prev, content: normalizedContent }));
      }
      const changed =
        draft.name !== (selectedTemplate.name || "") ||
        draft.description !== (selectedTemplate.description || "") ||
        normalizedContent !== (selectedTemplate.content || "");
      if (changed) {
        const ok = await saveTemplate();
        if (!ok) return;
      }
      const fillable = detectedVariables.filter((key) => !key.startsWith("SYS:"));
      const initial: Record<string, string> = {};
      fillable.forEach((key) => { initial[key] = ""; });
      setVariableValues(initial);
      setShowVariableModal(true);
    })();
  };

  const createFromTemplate = async (variables: Record<string, string>) => {
    if (!selected) return;
    setCreatingDoc(true);
    try {
      const doc = await apiFetch<Document>(`/templates/${selected.id}/create`, {
        method: "POST",
        body: JSON.stringify({ variables }),
      });
      router.push(`/docs/${doc.id}`);
    } catch (err) {
      toast({ description: err instanceof Error ? err.message : "Failed to create note from template", variant: "error" });
    } finally {
      setCreatingDoc(false);
      setShowVariableModal(false);
    }
  };

  const previewContent = useMemo(() => {
    return normalizeTemplatePlaceholders(draft.content).replace(VARIABLE_REGEX, (_raw, key: string) => {
      const normalized = String(key || "").trim().toUpperCase();
      if (!normalized) return "";
      if (normalized.startsWith("SYS:")) return resolveSystemVariableClient(normalized);
      return variableValues[normalized] || "";
    });
  }, [draft.content, variableValues]);

  return {
    router,
    templates: filteredTemplates,
    templatesTotal,
    loading,
    loadingMore,
    selectedID,
    setSelectedID,
    selected,
    draft,
    setDraft,
    creatingDoc,
    showVariableModal,
    setShowVariableModal,
    variableValues,
    setVariableValues,
    search,
    setSearch,
    selectedTagIDs,
    setSelectedTagIDs,
    visibleSelectedTags,
    tagQuery,
    setTagQuery,
    showTagInput,
    setShowTagInput,
    isSaveDisabled,
    handleTemplateListScroll,
    createTemplate,
    saveTemplate,
    addTag,
    deleteTemplate,
    prepareUseTemplate,
    createFromTemplate,
    previewContent,
  };
}
