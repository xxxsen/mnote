import { AiModal } from "./AiModal";
import {
  DeleteConfirmDialog,
  DocPreviewModal,
  PreviewModal,
} from "./EditorModals";
import { EditorContextDrawer } from "./EditorContextPanel";
import { PopoverPanels } from "./PopoverPanels";
import { QuickOpenDialog } from "./QuickOpenDialog";
import { SimilarNotesPanel } from "./SimilarNotesPanel";
import type { EditorShellFlatContract } from "../editor-contracts";

export function EditorOverlayHost({ p }: { p: EditorShellFlatContract }) {
  return (
    <>
      <SimilarNotesPanel
        similarIconVisible={p.sim.similarIconVisible}
        similarCollapsed={p.sim.similarCollapsed}
        similarLoading={p.sim.similarLoading}
        similarDocs={p.sim.similarDocs}
        onToggle={p.sim.handleToggleSimilar}
        onCollapse={p.sim.handleCollapseSimilar}
        onClose={p.sim.handleCloseSimilar}
        onOpenPreview={p.preview.handleOpenPreview}
        onNavigate={(id) => p.navigate(`/docs/${id}`)}
      />
      <DocPreviewModal
        previewDoc={p.preview.previewDoc}
        previewLoading={p.preview.previewLoading}
        onClose={() => p.preview.setPreviewDoc(null)}
        onOpenFull={(id) => p.navigate(`/docs/${id}`)}
      />
      <PreviewModal
        show={p.showPreviewModal}
        title={p.title}
        content={p.contentRef.current || p.ec.previewContent}
        onClose={() => p.setShowPreviewModal(false)}
      />
      <AiModal
        open={p.ai.aiModalOpen}
        aiAction={p.ai.aiAction}
        aiLoading={p.ai.aiLoading}
        aiApplying={p.ai.aiApplying}
        aiPrompt={p.ai.aiPrompt}
        aiResultText={p.ai.aiResultText}
        aiResultReady={p.ai.aiResultReady}
        aiExistingTags={p.ai.aiExistingTags}
        aiSuggestedTags={p.ai.aiSuggestedTags}
        aiSelectedTags={p.ai.aiSelectedTags}
        aiRemovedTagIDs={p.ai.aiRemovedTagIDs}
        aiError={p.ai.aiError}
        aiDiffLines={p.ai.aiDiffLines}
        aiTitle={p.ai.aiTitle}
        aiAvailableSlots={p.ai.aiAvailableSlots}
        setAiPrompt={p.ai.setAiPrompt}
        closeAiModal={p.ai.closeAiModal}
        handleAiGenerate={p.ai.handleAiGenerate}
        handleAiRetry={p.ai.handleAiRetry}
        handleApplyAiText={p.handleApplyAiText}
        handleApplyAiTags={() =>
          void p.ai.handleApplyAiTags({
            findExistingTagByName: p.tagState.findExistingTagByName,
            mergeTags: p.tagState.mergeTags,
            saveTagIDs: p.tagState.saveTagIDs,
            onError: (message) =>
              p.toast({ description: message, variant: "error" }),
          })
        }
        handleApplyAiSummary={() =>
          void p.ai.handleApplyAiSummary({
            onApplied: (summaryText) => {
              p.setSummary(summaryText);
              p.setLastSavedAt(Math.floor(Date.now() / 1000));
            },
            onError: (message) =>
              p.toast({ description: message, variant: "error" }),
          })
        }
        toggleAiTag={p.ai.toggleAiTag}
        toggleExistingTag={p.ai.toggleExistingTag}
      />
      <DeleteConfirmDialog
        show={p.showDeleteConfirm}
        title={p.title}
        onClose={() => p.setShowDeleteConfirm(false)}
        onDelete={p.handleDelete}
      />
      <QuickOpenDialog
        show={p.quickOpen.showQuickOpen}
        query={p.quickOpen.quickOpenQuery}
        index={p.quickOpen.quickOpenIndex}
        loading={p.quickOpen.quickOpenLoading}
        showSearchResults={p.quickOpen.showSearchResults}
        docs={p.quickOpen.quickOpenDocs}
        onQueryChange={p.quickOpen.setQuickOpenQuery}
        onIndexChange={p.quickOpen.setQuickOpenIndex}
        onSelect={p.quickOpen.handleQuickOpenSelect}
        onClose={p.quickOpen.handleCloseQuickOpen}
      />
      <EditorContextDrawer p={p} />
      <PopoverPanels
        activePopover={p.popover.activePopover}
        setActivePopover={p.popover.setActivePopover}
        emojiTab={p.popover.emojiTab}
        setEmojiTab={p.popover.setEmojiTab}
        activeEmojiTab={p.popover.activeEmojiTab}
        handleColor={p.popover.handleColor}
        handleSize={p.popover.handleSize}
        insertTextAtCursor={p.ec.insertTextAtCursor}
        renderPopover={p.popover.renderPopover}
      />
    </>
  );
}
