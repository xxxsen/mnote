/* eslint-disable react-hooks/refs -- false positive: props received from parent, no hooks called in this component */
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { EditorView } from "@codemirror/view";
import type { ThemeId } from "@/lib/editor-themes";
import type { DocumentVersionSummary } from "@/types";
import MarkdownPreview from "@/components/markdown-preview";

import type { useEditorContent } from "../hooks/useEditorContent";
import type { useScrollSync } from "../hooks/useScrollSync";
import type { usePopover } from "../hooks/usePopover";
import type { useSlashMenu } from "../hooks/useSlashMenu";
import type { useWikilinkMenu } from "../hooks/useWikilinkMenu";
import type { useLinkGraph } from "../hooks/useLinkGraph";
import type { useFloatingPanel } from "../hooks/useFloatingPanel";
import type { useInlineTag } from "../hooks/useInlineTag";
import type { useEditorExtensions } from "../hooks/useEditorExtensions";
import type { usePreviewDoc } from "../hooks/usePreviewDoc";
import type { useShareLink } from "../hooks/useShareLink";
import type { useQuickOpen } from "../hooks/useQuickOpen";
import type { useTagState } from "../hooks/useTagState";
import type { useAiAssistant } from "../hooks/useAiAssistant";
import type { useSimilarDocs } from "../hooks/useSimilarDocs";

import { EditorHeader } from "./EditorHeader";
import { EditorFooter } from "./EditorFooter";
import { EditorToolbar } from "./EditorToolbar";
import { DetailsSidebar } from "./DetailsSidebar";
import { SimilarNotesPanel } from "./SimilarNotesPanel";
import { QuickOpenDialog } from "./QuickOpenDialog";
import { AiModal } from "./AiModal";
import { DeleteConfirmDialog, DocPreviewModal, PreviewModal } from "./EditorModals";
import { FloatingPanel } from "./FloatingPanel";
import { PopoverPanels } from "./PopoverPanels";
import { InlineTagBar } from "./InlineTagBar";
import { EditorArea } from "./EditorArea";

export type EditorPageLayoutProps = {
  router: AppRouterInstance;
  toast: (o: { description: string | Error; variant?: "default" | "success" | "error" }) => void;
  docId: string;
  contentRef: React.RefObject<string>;
  ec: ReturnType<typeof useEditorContent>;
  scrollSync: ReturnType<typeof useScrollSync>;
  popover: ReturnType<typeof usePopover>;
  slashMenu: ReturnType<typeof useSlashMenu>;
  wikilinkMenu: ReturnType<typeof useWikilinkMenu>;
  linkGraphHook: ReturnType<typeof useLinkGraph>;
  floatingPanel: ReturnType<typeof useFloatingPanel>;
  inlineTag: ReturnType<typeof useInlineTag>;
  editorExt: ReturnType<typeof useEditorExtensions>;
  preview: ReturnType<typeof usePreviewDoc>;
  share: ReturnType<typeof useShareLink>;
  quickOpen: ReturnType<typeof useQuickOpen>;
  tagState: ReturnType<typeof useTagState>;
  ai: ReturnType<typeof useAiAssistant>;
  sim: ReturnType<typeof useSimilarDocs>;
  documentActions: { listVersions: () => Promise<DocumentVersionSummary[]> };
  title: string; summary: string; starred: number; saving: boolean;
  showDetails: boolean; setShowDetails: (v: boolean) => void;
  activeTab: "summary" | "history" | "share"; setActiveTab: (v: "summary" | "history" | "share") => void;
  currentThemeId: ThemeId; lastSavedAt: number | null;
  showDeleteConfirm: boolean; setShowDeleteConfirm: (v: boolean) => void;
  showPreviewModal: boolean; setShowPreviewModal: (v: boolean) => void;
  handleThemeChange: (id: ThemeId) => void; handleSave: () => Promise<void>; handleDelete: () => Promise<void>;
  handleStarToggle: () => Promise<void>; handleExportMarkdown: () => void; handleExportConfluenceHTML: () => Promise<void>;
  handleApplyAiText: () => void; handleRevert: (v: DocumentVersionSummary) => void;
  onCreateEditor: (view: EditorView) => void;
  setSummary: (v: string) => void; setLastSavedAt: (v: number) => void;
};

export function EditorPageLayout(p: EditorPageLayoutProps) {
  return (
    <div className="flex flex-col h-screen bg-background relative">
      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); }
        .cm-editor { font-family: 'JetBrains Mono', 'Fira Code', monospace !important; }
        .cm-editor * { transition: none !important; }
        .prose h1, .prose h2, .prose h3 { margin-top: 1.5em; margin-bottom: 0.5em; }
        .prose p { margin-bottom: 1em; line-height: 1.7; }
        #mermaid-error-box, .mermaid-error-overlay, [id^="mermaid-error"] { display: none !important; }
        .mermaid-container > svg[id^="mermaid-"] { max-width: 100%; height: auto; }
      `}</style>
      <EditorHeader router={p.router} title={p.title} handleSave={p.handleSave} saving={p.saving} hasUnsavedChanges={p.ec.hasUnsavedChanges} lastSavedAt={p.lastSavedAt} showDetails={p.showDetails} setShowDetails={p.setShowDetails} loadVersions={() => void p.documentActions.listVersions()} starred={p.starred} handleStarToggle={p.handleStarToggle} />
      <EditorMainArea p={p} />
      <EditorFooter cursorPos={p.ec.cursorPos} wordCount={p.ec.wordCount} charCount={p.ec.charCount} hasUnsavedChanges={p.ec.hasUnsavedChanges} />
      <EditorOverlays p={p} />
    </div>
  );
}

function EditorMainArea({ p }: { p: EditorPageLayoutProps }) {
  return (
    <div className="flex-1 flex overflow-hidden min-w-0 relative pb-8">
      <div className={`flex-1 flex flex-col md:flex-row h-full transition-all duration-300 min-w-0 ${p.showDetails ? "mr-80" : ""}`}>
        <div className="h-full border-r border-border overflow-hidden min-w-0 md:flex-[0_0_50%] w-full flex flex-col relative">
          <InlineTagBar
            selectedTags={p.tagState.selectedTags} toggleTag={p.tagState.toggleTag}
            inlineTagMode={p.inlineTag.inlineTagMode} setInlineTagMode={p.inlineTag.setInlineTagMode}
            inlineTagValue={p.inlineTag.inlineTagValue} setInlineTagValue={p.inlineTag.setInlineTagValue}
            inlineTagLoading={p.inlineTag.inlineTagLoading} inlineTagIndex={p.inlineTag.inlineTagIndex} setInlineTagIndex={p.inlineTag.setInlineTagIndex}
            inlineTagMenuPos={p.inlineTag.inlineTagMenuPos} inlineTagInputRef={p.inlineTag.inlineTagInputRef} inlineTagComposeRef={p.inlineTag.inlineTagComposeRef}
            inlineTagDropdownItems={p.inlineTag.inlineTagDropdownItems}
            handleInlineAddTag={() => void p.inlineTag.handleInlineAddTag()} handleInlineTagSelect={(item) => void p.inlineTag.handleInlineTagSelect(item)}
            handleOpenQuickOpen={p.quickOpen.handleOpenQuickOpen}
          />
          <EditorToolbar
            handleUndo={() => { p.popover.setActivePopover(null); p.ec.handleUndo(); }}
            handleRedo={() => { p.popover.setActivePopover(null); p.ec.handleRedo(); }}
            handleFormat={p.ec.handleFormat}
            handleInsertTable={() => { p.popover.setActivePopover(null); p.ec.handleInsertTable(); }}
            handleAiPolish={() => void p.ai.handleAiPolish(p.contentRef.current)}
            handleAiGenerateOpen={p.ai.handleAiGenerateOpen}
            handleAiTags={() => void p.ai.handleAiTags(p.contentRef.current)}
            handlePreviewOpen={() => p.setShowPreviewModal(true)}
            aiBusy={p.ai.aiLoading}
            activePopover={p.popover.activePopover} setActivePopover={p.popover.setActivePopover}
            colorButtonRef={p.popover.colorButtonRef} sizeButtonRef={p.popover.sizeButtonRef} emojiButtonRef={p.popover.emojiButtonRef}
            currentTheme={p.currentThemeId} onThemeChange={p.handleThemeChange}
          />
          <EditorArea
            content={p.ec.content} editorExtensions={p.editorExt.editorExtensions}
            schedulePreviewUpdate={p.ec.schedulePreviewUpdate} contentRef={p.contentRef} setContent={p.ec.setContent}
            onCreateEditor={p.onCreateEditor}
            slashMenu={p.slashMenu.slashMenu} slashIndex={p.slashMenu.slashIndex} setSlashIndex={p.slashMenu.setSlashIndex}
            filteredSlashCommands={p.slashMenu.filteredSlashCommands} handleSlashAction={p.slashMenu.handleSlashAction}
            wikilinkMenu={p.wikilinkMenu.wikilinkMenu} wikilinkResults={p.wikilinkMenu.wikilinkResults}
            wikilinkLoading={p.wikilinkMenu.wikilinkLoading} wikilinkIndex={p.wikilinkMenu.wikilinkIndex}
            handleWikilinkSelect={p.wikilinkMenu.handleWikilinkSelect}
          />
        </div>
        <div className="h-full bg-[#f8fafc] overflow-auto custom-scrollbar min-w-0 md:flex-[0_0_50%] w-full hidden md:block border-l border-border selection:bg-indigo-100" ref={p.scrollSync.previewRef} onScroll={p.scrollSync.handlePreviewScroll}>
          <div className="min-h-full p-4 md:p-8 lg:p-12">
            <div className="max-w-4xl mx-auto">
              <article className="w-full bg-white rounded-2xl shadow-[0_10px_40px_-15px_rgba(0,0,0,0.1)] border border-slate-200/50 relative overflow-visible">
                <div className="p-6 md:p-10 lg:p-12">
                  <MarkdownPreview content={p.ec.previewContent} className="markdown-body h-auto overflow-visible p-0 bg-transparent text-slate-800" onTocLoaded={p.floatingPanel.handleTocLoaded} enableMentionHoverPreview />
                </div>
              </article>
            </div>
          </div>
        </div>
      </div>
      <DetailsSidebar
        showDetails={p.showDetails} onClose={() => p.setShowDetails(false)}
        activeTab={p.activeTab} setActiveTab={p.setActiveTab}
        summary={p.summary}
        aiLoading={p.ai.aiLoading} onGenerateSummary={() => void p.ai.handleAiSummary(p.contentRef.current)}
        onShowDeleteConfirm={() => p.setShowDeleteConfirm(true)}
        onExportMarkdown={p.handleExportMarkdown} onExportConfluenceHTML={() => void p.handleExportConfluenceHTML()}
        documentActions={p.documentActions} onRevert={p.handleRevert}
        shareUrl={p.share.shareUrl} activeShare={p.share.activeShare} copied={p.share.copied}
        onShare={p.share.handleShare} onLoadShare={p.share.loadShare} onRevokeShare={p.share.handleRevokeShare} onCopyLink={p.share.handleCopyLink}
        onUpdateShareConfig={p.share.updateShareConfig}
      />
    </div>
  );
}

function EditorOverlays({ p }: { p: EditorPageLayoutProps }) {
  return (
    <>
      <SimilarNotesPanel similarIconVisible={p.sim.similarIconVisible} similarCollapsed={p.sim.similarCollapsed} similarLoading={p.sim.similarLoading} similarDocs={p.sim.similarDocs} onToggle={p.sim.handleToggleSimilar} onCollapse={p.sim.handleCollapseSimilar} onClose={p.sim.handleCloseSimilar} onOpenPreview={p.preview.handleOpenPreview} onNavigate={(id) => p.router.push(`/docs/${id}`)} />
      <DocPreviewModal previewDoc={p.preview.previewDoc} previewLoading={p.preview.previewLoading} onClose={() => p.preview.setPreviewDoc(null)} onOpenFull={(id) => p.router.push(`/docs/${id}`)} />
      <PreviewModal show={p.showPreviewModal} title={p.title} content={p.contentRef.current || p.ec.previewContent} onClose={() => p.setShowPreviewModal(false)} onTocLoaded={p.floatingPanel.handleTocLoaded} />
      <AiModal
        open={p.ai.aiModalOpen} aiAction={p.ai.aiAction} aiLoading={p.ai.aiLoading} aiPrompt={p.ai.aiPrompt}
        aiResultText={p.ai.aiResultText} aiExistingTags={p.ai.aiExistingTags} aiSuggestedTags={p.ai.aiSuggestedTags}
        aiSelectedTags={p.ai.aiSelectedTags} aiRemovedTagIDs={p.ai.aiRemovedTagIDs} aiError={p.ai.aiError}
        aiDiffLines={p.ai.aiDiffLines} aiTitle={p.ai.aiTitle} aiAvailableSlots={p.ai.aiAvailableSlots}
        setAiPrompt={p.ai.setAiPrompt} closeAiModal={p.ai.closeAiModal} handleAiGenerate={p.ai.handleAiGenerate}
        handleApplyAiText={p.handleApplyAiText}
        handleApplyAiTags={() => void p.ai.handleApplyAiTags({ findExistingTagByName: p.tagState.findExistingTagByName, mergeTags: p.tagState.mergeTags, saveTagIDs: p.tagState.saveTagIDs, onError: (message) => p.toast({ description: message, variant: "error" }) })}
        handleApplyAiSummary={() => void p.ai.handleApplyAiSummary({ onApplied: (summaryText) => { p.setSummary(summaryText); p.setLastSavedAt(Math.floor(Date.now() / 1000)); }, onError: (message) => p.toast({ description: message, variant: "error" }) })}
        toggleAiTag={p.ai.toggleAiTag} toggleExistingTag={p.ai.toggleExistingTag}
      />
      <DeleteConfirmDialog show={p.showDeleteConfirm} title={p.title} onClose={() => p.setShowDeleteConfirm(false)} onDelete={p.handleDelete} />
      <QuickOpenDialog
        show={p.quickOpen.showQuickOpen} query={p.quickOpen.quickOpenQuery} index={p.quickOpen.quickOpenIndex}
        loading={p.quickOpen.quickOpenLoading} showSearchResults={p.quickOpen.showSearchResults} docs={p.quickOpen.quickOpenDocs}
        onQueryChange={p.quickOpen.setQuickOpenQuery} onIndexChange={p.quickOpen.setQuickOpenIndex}
        onSelect={p.quickOpen.handleQuickOpenSelect} onClose={p.quickOpen.handleCloseQuickOpen}
      />
      <FloatingPanel
        showDetails={p.showDetails}
        hasTocPanel={p.floatingPanel.hasTocPanel} hasMentionsPanel={p.floatingPanel.hasMentionsPanel}
        hasGraphPanel={p.floatingPanel.hasGraphPanel} hasSummaryPanel={p.floatingPanel.hasSummaryPanel}
        tocCollapsed={p.floatingPanel.tocCollapsed} setTocCollapsed={p.floatingPanel.setTocCollapsed}
        floatingPanelTab={p.floatingPanel.floatingPanelTab} setFloatingPanelTab={p.floatingPanel.setFloatingPanelTab}
        setFloatingPanelTouched={p.floatingPanel.setFloatingPanelTouched}
        tocContent={p.floatingPanel.tocContent} summary={p.summary}
        backlinks={p.linkGraphHook.backlinks} outboundLinks={p.linkGraphHook.outboundLinks} linkGraph={p.linkGraphHook.linkGraph}
        previewRef={p.scrollSync.previewRef} forcePreviewSyncRef={p.scrollSync.forcePreviewSyncRef} handlePreviewScroll={p.scrollSync.handlePreviewScroll}
        onNavigate={(path) => p.router.push(path)}
      />
      <PopoverPanels
        activePopover={p.popover.activePopover} setActivePopover={p.popover.setActivePopover}
        emojiTab={p.popover.emojiTab} setEmojiTab={p.popover.setEmojiTab} activeEmojiTab={p.popover.activeEmojiTab}
        handleColor={p.popover.handleColor} handleSize={p.popover.handleSize}
        insertTextAtCursor={p.ec.insertTextAtCursor} renderPopover={p.popover.renderPopover}
      />
    </>
  );
}
