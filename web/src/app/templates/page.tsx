"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Copy, Save, Tags, X } from "lucide-react";
import { useTemplates } from "./hooks/useTemplates";
import { MAX_TAGS, normalizeTemplatePlaceholders } from "./utils";
import { VariableModal } from "./components/VariableModal";
import { DeleteTemplateDialog } from "./components/DeleteTemplateDialog";
import { TemplateList } from "./components/TemplateList";

export default function TemplatesPage() {
  const {
    router, templates: filteredTemplates, templatesTotal, loading, loadingMore,
    selectedID, setSelectedID, selected, draft, setDraft, creatingDoc,
    showVariableModal, setShowVariableModal, variableValues, setVariableValues,
    search, setSearch, pendingDelete, deletingTemplate,
    selectedTagIDs, setSelectedTagIDs, visibleSelectedTags,
    tagQuery, setTagQuery, showTagInput, setShowTagInput, isSaveDisabled,
    handleTemplateListScroll, createTemplate, saveTemplate, addTag,
    requestDeleteTemplate, cancelDeleteTemplate, confirmDeleteTemplate,
    prepareUseTemplate, createFromTemplate, previewContent,
  } = useTemplates();

  return (
    <div className="min-h-screen bg-background p-6 text-foreground">
      <div className="mx-auto mb-4 flex max-w-6xl items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => router.push("/docs")}><ChevronLeft className="h-4 w-4" /></Button>
          <h1 className="text-xl font-bold">Templates</h1>
        </div>
      </div>
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
        <TemplateList filteredTemplates={filteredTemplates} templatesTotal={templatesTotal} loading={loading} loadingMore={loadingMore}
          selectedID={selectedID} search={search} setSearch={setSearch} setSelectedID={setSelectedID}
          onDelete={requestDeleteTemplate} onCreate={() => void createTemplate()} onScroll={handleTemplateListScroll} />

        <div className="flex h-[75vh] max-h-[calc(100vh-10rem)] flex-col overflow-hidden rounded-xl border border-border bg-card p-4">
          {!selected ? (
            <div className="text-sm text-muted-foreground">Select a template.</div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Name</label>
                <Input value={draft.name} onChange={(event) => setDraft((previous) => ({ ...previous, name: event.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Description</label>
                <Input value={draft.description} onChange={(event) => setDraft((previous) => ({ ...previous, description: event.target.value }))} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Template Tags</label>
                <div className="no-scrollbar mt-1 flex h-8 items-center gap-1.5 overflow-x-auto">
                  {visibleSelectedTags.map((tag) => (
                    <span key={tag.id} className="group relative inline-flex h-6 items-center whitespace-nowrap rounded-full border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700" title={`#${tag.name}`}>
                      {tag.name}
                      <button type="button" onClick={() => setSelectedTagIDs((previous) => previous.filter((id) => id !== tag.id))}
                        className="absolute -right-1 -top-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-400 hover:text-slate-700 group-hover:flex"
                        aria-label={`Remove ${tag.name}`} title="Remove tag"><X className="h-2.5 w-2.5" /></button>
                    </span>
                  ))}
                  {selectedTagIDs.length < MAX_TAGS && (
                    showTagInput ? (
                      <input autoFocus value={tagQuery}
                        onChange={(event) => setTagQuery(event.target.value.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "").slice(0, 16))}
                        placeholder="Tag name" maxLength={16}
                        className="h-6 w-28 rounded-full border border-slate-300 bg-white px-2 text-[11px] outline-none focus:border-slate-500"
                        onBlur={() => { setShowTagInput(false); setTagQuery(""); }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") { event.preventDefault(); void addTag(tagQuery); return; }
                          if (event.key === "Escape") { event.preventDefault(); setTagQuery(""); setShowTagInput(false); }
                        }} />
                    ) : (
                      <button type="button" onClick={() => setShowTagInput(true)}
                        className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] text-slate-500 transition-colors hover:text-slate-800" title="Add tag">
                        <Tags className="h-3.5 w-3.5" />Add Tag
                      </button>
                    )
                  )}
                  <div className="ml-auto shrink-0 text-[11px] text-muted-foreground">{visibleSelectedTags.length}/{MAX_TAGS}</div>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <label className="text-xs text-muted-foreground">Content</label>
                <textarea className="h-full min-h-[240px] w-full rounded-md border border-border bg-background p-3 font-mono text-sm"
                  value={draft.content} onChange={(event) => setDraft((previous) => ({ ...previous, content: event.target.value }))}
                  onBlur={() => { const normalized = normalizeTemplatePlaceholders(draft.content); if (normalized !== draft.content) setDraft((previous) => ({ ...previous, content: normalized })); }} />
              </div>
              <div className="mt-auto flex flex-wrap justify-between gap-2 border-t border-border pt-2">
                <Button onClick={prepareUseTemplate} disabled={creatingDoc}><Copy className="mr-2 h-4 w-4" />Use Template</Button>
                <Button variant="outline" onClick={() => void saveTemplate()} disabled={isSaveDisabled}><Save className="mr-2 h-4 w-4" />Save</Button>
              </div>
            </div>
          )}
        </div>
      </div>
      {showVariableModal && selected ? (
        <VariableModal variableValues={variableValues} setVariableValues={setVariableValues}
          previewContent={previewContent} creatingDoc={creatingDoc}
          onCancel={() => setShowVariableModal(false)} onApply={createFromTemplate} />
      ) : null}
      {pendingDelete ? (
        <DeleteTemplateDialog
          templateName={pendingDelete.name}
          deleting={deletingTemplate}
          onCancel={cancelDeleteTemplate}
          onConfirm={confirmDeleteTemplate}
        />
      ) : null}
    </div>
  );
}
