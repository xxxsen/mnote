"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Copy, Save, Tags, X } from "lucide-react";
import { useTemplates } from "./hooks/useTemplates";
import { MAX_TAGS, normalizeTemplatePlaceholders } from "./utils";
import { VariableModal } from "./components/VariableModal";
import { TemplateList } from "./components/TemplateList";

export default function TemplatesPage() {
  const {
    router, templates: filteredTemplates, templatesTotal, loading, loadingMore,
    selectedID, setSelectedID, selected, draft, setDraft, creatingDoc,
    showVariableModal, setShowVariableModal, variableValues, setVariableValues,
    search, setSearch, selectedTagIDs, setSelectedTagIDs, visibleSelectedTags,
    tagQuery, setTagQuery, showTagInput, setShowTagInput, isSaveDisabled,
    handleTemplateListScroll, createTemplate, saveTemplate, addTag,
    deleteTemplate, prepareUseTemplate, createFromTemplate, previewContent,
  } = useTemplates();

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-6xl mx-auto flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.push("/docs")}><ChevronLeft className="h-4 w-4" /></Button>
          <h1 className="text-xl font-bold">Templates</h1>
        </div>
      </div>
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
        <TemplateList filteredTemplates={filteredTemplates} templatesTotal={templatesTotal} loading={loading} loadingMore={loadingMore}
          selectedID={selectedID} search={search} setSearch={setSearch} setSelectedID={setSelectedID}
          onDelete={(id, name) => void deleteTemplate(id, name)} onCreate={() => void createTemplate()} onScroll={handleTemplateListScroll} />

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
                    <span key={tag.id} className="group relative inline-flex items-center px-2.5 h-6 rounded-full border border-slate-200 bg-white text-[11px] font-medium text-slate-700 whitespace-nowrap" title={`#${tag.name}`}>
                      {tag.name}
                      <button type="button" onClick={() => setSelectedTagIDs((prev) => prev.filter((id) => id !== tag.id))}
                        className="hidden group-hover:flex absolute -top-1 -right-1 h-3.5 w-3.5 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-400 hover:text-slate-700"
                        aria-label={`Remove ${tag.name}`} title="Remove tag"><X className="h-2.5 w-2.5" /></button>
                    </span>
                  ))}
                  {selectedTagIDs.length < MAX_TAGS && (
                    showTagInput ? (
                      <input autoFocus value={tagQuery}
                        onChange={(e) => setTagQuery(e.target.value.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "").slice(0, 16))}
                        placeholder="Tag name" maxLength={16}
                        className="h-6 w-28 rounded-full border border-slate-300 bg-white px-2 text-[11px] outline-none focus:border-slate-500"
                        onBlur={() => { setShowTagInput(false); setTagQuery(""); }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); void addTag(tagQuery); return; }
                          if (e.key === "Escape") { e.preventDefault(); setTagQuery(""); setShowTagInput(false); }
                        }} />
                    ) : (
                      <button type="button" onClick={() => setShowTagInput(true)}
                        className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800 transition-colors whitespace-nowrap" title="Add tag">
                        <Tags className="h-3.5 w-3.5" />Add Tag
                      </button>
                    )
                  )}
                  <div className="ml-auto shrink-0 text-[11px] text-muted-foreground">{visibleSelectedTags.length}/{MAX_TAGS}</div>
                </div>
              </div>
              <div className="flex-1 min-h-0 flex flex-col">
                <label className="text-xs text-muted-foreground">Content</label>
                <textarea className="w-full h-full min-h-[240px] rounded-md border border-border bg-background p-3 text-sm font-mono"
                  value={draft.content} onChange={(e) => setDraft((prev) => ({ ...prev, content: e.target.value }))}
                  onBlur={() => { const n = normalizeTemplatePlaceholders(draft.content); if (n !== draft.content) setDraft((prev) => ({ ...prev, content: n })); }} />
              </div>
              <div className="flex flex-wrap gap-2 justify-between mt-auto pt-2 border-t border-border">
                <Button onClick={prepareUseTemplate} disabled={creatingDoc}><Copy className="h-4 w-4 mr-2" />Use Template</Button>
                <Button variant="outline" onClick={() => void saveTemplate()} disabled={isSaveDisabled}><Save className="h-4 w-4 mr-2" />Save</Button>
              </div>
            </div>
          )}
        </div>
      </div>
      {showVariableModal && selected && (
        <VariableModal variableValues={variableValues} setVariableValues={setVariableValues}
          previewContent={previewContent} creatingDoc={creatingDoc}
          onCancel={() => setShowVariableModal(false)} onApply={createFromTemplate} />
      )}
    </div>
  );
}
