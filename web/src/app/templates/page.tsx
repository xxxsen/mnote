"use client";

import { Plus, Save, Tags, X } from "lucide-react";
import { useState } from "react";

import { AppPage } from "@/components/app-page";
import { ResponsiveMasterDetail } from "@/components/responsive-master-detail";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageState } from "@/components/ui/page-state";
import { DeleteTemplateDialog } from "./components/DeleteTemplateDialog";
import { TemplateList } from "./components/TemplateList";
import { UnsavedTemplateDialog } from "./components/UnsavedTemplateDialog";
import { VariableModal } from "./components/VariableModal";
import { useTemplates } from "./hooks/useTemplates";
import { MAX_TAGS, normalizeTemplatePlaceholders } from "./utils";

export default function TemplatesPage() {
  const templates = useTemplates();
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const hasSelection = Boolean(templates.selectedID);

  return (
    <AppPage
      title="Templates"
      description={templates.isDirty ? "Unsaved changes" : "Reusable note structures"}
      width="wide"
      onBack={() => templates.requestNavigate("/docs")}
      onNavigateRequest={templates.requestNavigate}
      primaryAction={(
        <Button
          onClick={() => templates.requestCreateTemplate(() => setMobileDetailOpen(true))}
          disabled={templates.saving}
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          New template
        </Button>
      )}
    >
      <ResponsiveMasterDetail
        hasSelection={hasSelection}
        mobileDetailOpen={mobileDetailOpen}
        listLabel="Templates"
        detailLabel={templates.selectedTemplate?.name || "Template editor"}
        onBackToList={() => templates.requestMobileBack(() => setMobileDetailOpen(false))}
        list={(
          <TemplateList
            templates={templates.templates}
            templatesTotal={templates.templatesTotal}
            loading={templates.loading}
            loadingMore={templates.loadingMore}
            listError={templates.listError}
            loadMoreError={templates.loadMoreError}
            selectedID={templates.selectedID}
            search={templates.search}
            setSearch={templates.setSearch}
            onSelect={(id) => templates.requestSelectTemplate(id, () => setMobileDetailOpen(true))}
            onDelete={templates.requestDeleteTemplate}
            onRetry={() => void templates.reload()}
            onRetryLoadMore={templates.retryLoadMore}
            onScroll={templates.handleTemplateListScroll}
          />
        )}
        emptyDetail={<PageState kind="empty" title="Select a template" description="Choose a template from the list to edit it." />}
        detail={(
          <TemplateEditor templates={templates} />
        )}
      />
      {templates.showVariableModal && templates.selected ? (
        <VariableModal
          variableValues={templates.variableValues}
          setVariableValues={templates.setVariableValues}
          previewContent={templates.previewContent}
          creatingDoc={templates.creatingDoc}
          onCancel={() => templates.setShowVariableModal(false)}
          onApply={templates.createFromTemplate}
        />
      ) : null}
      {templates.pendingDelete ? (
        <DeleteTemplateDialog
          templateName={templates.pendingDelete.name}
          deleting={templates.deletingTemplate}
          onCancel={templates.cancelDeleteTemplate}
          onConfirm={templates.confirmDeleteTemplate}
        />
      ) : null}
      {templates.pendingChange ? (
        <UnsavedTemplateDialog
          saving={templates.saving}
          onCancel={templates.cancelPendingChange}
          onDiscard={templates.discardAndContinue}
          onSave={templates.saveAndContinue}
        />
      ) : null}
    </AppPage>
  );
}

type TemplatesState = ReturnType<typeof useTemplates>;

function TemplateEditor({ templates }: { templates: TemplatesState }) {
  if (templates.detailLoading) {
    return <PageState kind="loading" title="Loading template…" />;
  }
  if (templates.detailError) {
    return (
      <PageState
        kind="error"
        title="Template could not be loaded"
        description={templates.detailError}
        actionLabel="Retry"
        onAction={templates.retryDetail}
      />
    );
  }
  if (!templates.selectedTemplate) {
    return <PageState kind="empty" title="Select a template" />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
        {templates.isDirty ? (
          <div role="status" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
            Unsaved changes
          </div>
        ) : null}
        <Field label="Name" htmlFor="template-name">
          <Input
            id="template-name"
            value={templates.draft.name}
            onChange={(event) => templates.setDraft((previous) => ({ ...previous, name: event.target.value }))}
          />
        </Field>
        <Field label="Description" htmlFor="template-description">
          <Input
            id="template-description"
            value={templates.draft.description}
            onChange={(event) => templates.setDraft((previous) => ({ ...previous, description: event.target.value }))}
          />
        </Field>
        <TemplateTags templates={templates} />
        <Field label="Content" htmlFor="template-content">
          <textarea
            id="template-content"
            className="min-h-72 w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-sm leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={templates.draft.content}
            onChange={(event) => templates.setDraft((previous) => ({ ...previous, content: event.target.value }))}
            onBlur={() => {
              const normalized = normalizeTemplatePlaceholders(templates.draft.content);
              if (normalized !== templates.draft.content) {
                templates.setDraft((previous) => ({ ...previous, content: normalized }));
              }
            }}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3 sm:p-4">
        <Button
          variant="secondary"
          onClick={templates.prepareUseTemplate}
          disabled={templates.creatingDoc || templates.saving}
        >
          Use template
        </Button>
        <Button
          onClick={() => void templates.saveTemplate()}
          disabled={templates.isSaveDisabled}
          isLoading={templates.saving}
        >
          <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          Save
        </Button>
      </div>
    </div>
  );
}

function TemplateTags({ templates }: { templates: TemplatesState }) {
  return (
    <Field label="Tags" htmlFor="template-tag-input" description={`${templates.visibleSelectedTags.length} of ${MAX_TAGS} tags selected`}>
      <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-md border border-border p-2">
        {templates.visibleSelectedTags.map((tag) => (
          <span key={tag.id} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-border bg-muted px-2 text-xs">
            {tag.name}
            <button
              type="button"
              aria-label={`Remove ${tag.name}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => templates.setSelectedTagIDs((previous) => previous.filter((id) => id !== tag.id))}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </span>
        ))}
        {templates.selectedTagIDs.length < MAX_TAGS ? (
          templates.showTagInput ? (
            <input
              id="template-tag-input"
              autoFocus
              value={templates.tagQuery}
              placeholder="Tag name"
              maxLength={16}
              className="h-8 min-w-28 flex-1 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              onChange={(event) => templates.setTagQuery(event.target.value.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "").slice(0, 16))}
              onBlur={() => {
                templates.setShowTagInput(false);
                templates.setTagQuery("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void templates.addTag(templates.tagQuery);
                } else if (event.key === "Escape") {
                  templates.setTagQuery("");
                  templates.setShowTagInput(false);
                }
              }}
            />
          ) : (
            <button
              id="template-tag-input"
              type="button"
              className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => templates.setShowTagInput(true)}
            >
              <Tags className="h-4 w-4" aria-hidden="true" />
              Add tag
            </button>
          )
        ) : null}
      </div>
    </Field>
  );
}
