"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { Template, TemplateMeta, Document, Tag } from "@/types";
import { ChevronLeft, Copy, Plus, Save, Search, Tags, X } from "lucide-react";

type TemplateDraft = {
  name: string;
  description: string;
  content: string;
};

const emptyDraft: TemplateDraft = {
  name: "",
  description: "",
  content: "",
};

const VARIABLE_REGEX = /\{\{\s*([a-zA-Z0-9_:\-]+)\s*\}\}/g;
const MAX_TAGS = 7;
const TAG_NAME_REGEX = /^[\p{Script=Han}A-Za-z0-9]{1,16}$/u;
const normalizeTemplatePlaceholders = (content: string) =>
  content.replace(VARIABLE_REGEX, (_raw, key: string) => `{{${String(key || "").trim().toUpperCase()}}}`);

const resolveSystemVariableClient = (key: string) => {
  const now = new Date();
  const normalized = key.trim().toUpperCase();
  if (normalized === "SYS:TODAY" || normalized === "SYS:DATE") {
    return now.toISOString().slice(0, 10);
  }
  if (normalized === "SYS:TIME") {
    return now.toTimeString().slice(0, 5);
  }
  if (normalized === "SYS:DATETIME" || normalized === "SYS:NOW") {
    const date = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 5);
    return `${date} ${time}`;
  }
  return "";
};

export default function TemplatesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [loading, setLoading] = useState(true);
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
    allTags.forEach((tag) => {
      map[tag.id] = tag;
    });
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

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const items = await apiFetch<TemplateMeta[]>("/templates/meta");
      const next = items || [];
      setTemplates(next);
      setSelectedID((prev) => {
        if (next.length === 0) return "";
        if (!prev) return next[0].id;
        if (next.find((item) => item.id === prev)) return prev;
        return next[0].id;
      });
    } catch (err) {
      toast({ description: err instanceof Error ? err.message : "Failed to load templates", variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    const loadSelectedTemplate = async () => {
      if (!selectedID) {
        setSelectedTemplate(null);
        return;
      }
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
        body: JSON.stringify({
          name: "New Template",
          description: "",
          content: "# New Template\n",
          default_tag_ids: [],
        }),
      });
      await loadTemplates();
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
        body: JSON.stringify({
          name: draft.name,
          description: draft.description,
          content: normalizedContent,
          default_tag_ids: selectedTagIDs,
        }),
      });
      if (normalizedContent !== draft.content) {
        setDraft((prev) => ({ ...prev, content: normalizedContent }));
      }
      toast({ description: "Template saved." });
      await loadTemplates();
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
      const created = await apiFetch<Tag>("/tags", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
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
      await loadTemplates();
      if (selectedID === templateID) {
        setSelectedID("");
      }
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
      fillable.forEach((key) => {
        initial[key] = "";
      });
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
      if (normalized.startsWith("SYS:")) {
        return resolveSystemVariableClient(normalized);
      }
      return variableValues[normalized] || "";
    });
  }, [draft.content, variableValues]);

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-6xl mx-auto flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.push("/docs")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">Templates</h1>
        </div>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
        <div className="border border-border rounded-xl p-4 bg-card h-[75vh] max-h-[calc(100vh-10rem)] overflow-hidden flex flex-col">
          <div className="relative p-1 mb-2 border-b border-border">
              <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input className="pl-8 h-8" placeholder="Search template title..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto pr-2" style={{ scrollbarGutter: "stable" }}>
            {loading ? (
              <div className="text-sm text-muted-foreground p-3">Loading...</div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-sm text-muted-foreground p-3">No templates.</div>
            ) : (
              filteredTemplates.map((item) => (
                <div
                  key={item.id}
                  onClick={() => setSelectedID(item.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedID(item.id);
                    }
                  }}
                  className={`w-full text-left rounded-lg px-3 py-2 mb-1 border ${item.id === selectedID ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 text-left">
                      <div className="text-sm font-semibold truncate">{item.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{item.description || "No description"}</div>
                    </div>
                    {item.id === selectedID && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 shrink-0 self-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteTemplate(item.id, item.name);
                        }}
                        title="Delete template"
                      >
                        <X className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="pt-2 mt-auto border-t border-border">
            <Button onClick={() => void createTemplate()} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Button>
          </div>
        </div>

        <div className="border border-border rounded-xl p-4 bg-card h-[75vh] max-h-[calc(100vh-10rem)] overflow-hidden flex flex-col">
          {!selected ? (
            <div className="text-sm text-muted-foreground">Select a template.</div>
          ) : (
            <div className="flex flex-col gap-3 flex-1 min-h-0">
              <div>
                <label className="text-xs text-muted-foreground">Name</label>
                <Input value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Description</label>
                <Input value={draft.description} onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Template Tags</label>
                <div className="mt-1 h-8 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {visibleSelectedTags.map((tag) => (
                    <span
                      key={tag.id}
                      className="group relative inline-flex items-center px-2.5 h-6 rounded-full border border-slate-200 bg-white text-[11px] font-medium text-slate-700 whitespace-nowrap"
                      title={`#${tag.name}`}
                    >
                      {tag.name}
                      <button
                        type="button"
                        onClick={() => setSelectedTagIDs((prev) => prev.filter((id) => id !== tag.id))}
                        className="hidden group-hover:flex absolute -top-1 -right-1 h-3.5 w-3.5 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-400 hover:text-slate-700"
                        aria-label={`Remove ${tag.name}`}
                        title="Remove tag"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}

                  {selectedTagIDs.length < MAX_TAGS && (
                    showTagInput ? (
                      <input
                        autoFocus
                        value={tagQuery}
                        onChange={(e) => setTagQuery(e.target.value.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "").slice(0, 16))}
                        placeholder="Tag name"
                        maxLength={16}
                        className="h-6 w-28 rounded-full border border-slate-300 bg-white px-2 text-[11px] outline-none focus:border-slate-500"
                        onBlur={() => {
                          setShowTagInput(false);
                          setTagQuery("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void addTag(tagQuery);
                            return;
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setTagQuery("");
                            setShowTagInput(false);
                          }
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowTagInput(true)}
                        className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 transition-colors whitespace-nowrap"
                        title="Add tag"
                      >
                        <Tags className="h-3.5 w-3.5" />
                        Add Tag
                      </button>
                    )
                  )}

                  <div className="ml-auto shrink-0 text-[11px] text-muted-foreground">{visibleSelectedTags.length}/{MAX_TAGS}</div>
                </div>
              </div>
              <div className="flex-1 min-h-0 flex flex-col">
                <label className="text-xs text-muted-foreground">Content</label>
                <textarea
                  className="w-full h-full min-h-[240px] rounded-md border border-border bg-background p-3 text-sm font-mono"
                  value={draft.content}
                  onChange={(e) => setDraft((prev) => ({ ...prev, content: e.target.value }))}
                  onBlur={() => {
                    const normalized = normalizeTemplatePlaceholders(draft.content);
                    if (normalized !== draft.content) {
                      setDraft((prev) => ({ ...prev, content: normalized }));
                    }
                  }}
                />
              </div>
              <div className="flex flex-wrap gap-2 justify-between mt-auto pt-2 border-t border-border">
                <Button onClick={prepareUseTemplate} disabled={creatingDoc}>
                  <Copy className="h-4 w-4 mr-2" />
                  Use Template
                </Button>
                <Button variant="outline" onClick={() => void saveTemplate()} disabled={isSaveDisabled}>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showVariableModal && selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-5xl max-h-[90vh] rounded-xl border border-border bg-card p-4 overflow-hidden">
            <div className="text-sm font-semibold mb-3">Template Preview</div>
            <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 h-[calc(90vh-6rem)] min-h-[360px]">
              <div className="space-y-3 overflow-y-auto pr-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Variables</div>
                {Object.keys(variableValues).length === 0 ? (
                  <div className="text-xs text-muted-foreground">No custom variables.</div>
                ) : (
                  Object.keys(variableValues).map((key) => (
                    <div key={key} className="grid grid-cols-[120px_1fr] items-center gap-2">
                      <div className="text-xs text-muted-foreground font-mono truncate">{key}</div>
                      <Input
                        value={variableValues[key] || ""}
                        onChange={(e) => setVariableValues((prev) => ({ ...prev, [key]: e.target.value }))}
                        placeholder="Value"
                      />
                    </div>
                  ))
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setShowVariableModal(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => void createFromTemplate(variableValues)} disabled={creatingDoc}>
                    Apply
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-background p-3 overflow-y-auto">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Preview</div>
                <pre className="text-sm whitespace-pre-wrap break-words font-mono leading-6">{previewContent}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
