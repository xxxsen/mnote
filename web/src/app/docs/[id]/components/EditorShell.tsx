import MarkdownPreview from "@/components/markdown-preview";
import { ReadingSurface } from "@/components/reading-surface";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type {
  EditorShellFlatContract,
  EditorShellProps,
} from "../editor-contracts";

import type { EditorViewMode } from "../hooks/useEditorViewMode";
import { useDesktopViewport } from "../hooks/useDesktopViewport";

import { EditorHeader } from "./EditorHeader";
import { EditorFooter } from "./EditorFooter";
import { EditorToolbar } from "./EditorToolbar";
import { MobileEditorToolbar } from "./MobileEditorToolbar";
import { EditorContextRail } from "./EditorContextPanel";
import { InlineTagBar } from "./InlineTagBar";
import { EditorArea } from "./EditorArea";
import { SplitPane } from "./SplitPane";
import { EditorOverlayHost } from "./EditorOverlayHost";

export function EditorShell({ session, commands, ui }: EditorShellProps) {
  const p: EditorShellFlatContract = { ...session, ...commands, ...ui };
  return (
    <main
      aria-label="Document editor"
      className="relative flex h-dvh flex-col overflow-hidden bg-background"
    >
      <EditorHeader
        onBack={() => p.navigate("/docs")}
        title={p.title}
        syncStatus={p.saveStatus}
        titleMissing={p.titleMissing}
        onSave={p.handleSave}
        onRetry={p.handleRetry}
        onResolveConflict={p.handleResolveConflict}
        outlineOpen={p.contextRail.outlineOpen}
        detailsOpen={p.contextRail.detailsOpen}
        onShowOutline={p.contextRail.openOutline}
        onToggleDetails={p.contextRail.toggleDetails}
        starred={p.starred}
        handleStarToggle={p.handleStarToggle}
        viewMode={p.viewMode}
        setViewMode={p.setViewMode}
        scrollSyncEnabled={p.scrollSyncEnabled}
        onToggleScrollSync={() => p.setScrollSyncEnabled(!p.scrollSyncEnabled)}
      />
      <MobileModeSwitch mode={p.viewMode} onChange={p.setViewMode} />
      {p.localBackupUnavailable && (
        <div
          role="alert"
          className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs font-medium text-destructive"
        >
          Local backup unavailable. Keep this tab open until saving succeeds.
        </div>
      )}
      <EditorMainArea p={p} />
      <EditorFooter
        cursorPos={p.ec.cursorPos}
        wordCount={p.ec.wordCount}
        charCount={p.ec.charCount}
        saveStatus={p.saveStatus}
        titleMissing={p.titleMissing}
        onRetry={p.handleRetry}
      />
      <EditorOverlayHost p={p} />
    </main>
  );
}

function MobileModeSwitch(props: {
  mode: EditorViewMode;
  onChange: (mode: EditorViewMode) => void;
}) {
  const mobileMode = props.mode === "preview" ? "preview" : "edit";
  return (
    <div className="border-b border-border p-1 lg:hidden">
      <SegmentedControl
        label="Editor view"
        value={mobileMode}
        options={[
          { value: "edit", label: "Edit" },
          { value: "preview", label: "Preview" },
        ]}
        onChange={props.onChange}
        className="w-full [&>button]:min-h-11 [&>button]:flex-1 sm:[&>button]:min-h-10"
      />
    </div>
  );
}

function EditorMainArea({ p }: { p: EditorShellFlatContract }) {
  const isDesktop = useDesktopViewport();
  const mobilePreview = p.viewMode === "preview";

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 pb-8">
      <div className="h-full min-w-0 flex-1">
        {isDesktop ? (
          p.viewMode === "split" ? (
            <SplitPane
              ratio={p.splitRatio}
              onRatioChange={p.setSplitRatio}
              left={<EditorPane p={p} />}
              right={<PreviewPane p={p} />}
            />
          ) : p.viewMode === "preview" ? (
            <PreviewPane p={p} />
          ) : (
            <EditorPane p={p} />
          )
        ) : mobilePreview ? (
          <PreviewPane p={p} />
        ) : (
          <EditorPane p={p} />
        )}
      </div>
      <EditorContextRail p={p} />
    </div>
  );
}

function EditorPane({ p }: { p: EditorShellFlatContract }) {
  return (
    <section
      aria-label="Markdown editor"
      className="relative flex h-full min-w-0 flex-col overflow-hidden border-r border-border"
    >
      <InlineTagBar
        selectedTags={p.tagState.selectedTags}
        toggleTag={p.tagState.toggleTag}
        inlineTagMode={p.inlineTag.inlineTagMode}
        setInlineTagMode={p.inlineTag.setInlineTagMode}
        inlineTagValue={p.inlineTag.inlineTagValue}
        setInlineTagValue={p.inlineTag.setInlineTagValue}
        inlineTagLoading={p.inlineTag.inlineTagLoading}
        inlineTagIndex={p.inlineTag.inlineTagIndex}
        setInlineTagIndex={p.inlineTag.setInlineTagIndex}
        inlineTagMenuPos={p.inlineTag.inlineTagMenuPos}
        inlineTagInputRef={p.inlineTag.inlineTagInputRef}
        inlineTagComposeRef={p.inlineTag.inlineTagComposeRef}
        inlineTagDropdownItems={p.inlineTag.inlineTagDropdownItems}
        handleInlineAddTag={() => void p.inlineTag.handleInlineAddTag()}
        handleInlineTagSelect={(item) =>
          void p.inlineTag.handleInlineTagSelect(item)
        }
        handleOpenQuickOpen={p.quickOpen.handleOpenQuickOpen}
      />
      <EditorToolbar
        handleUndo={() => {
          p.popover.setActivePopover(null);
          p.ec.handleUndo();
        }}
        handleRedo={() => {
          p.popover.setActivePopover(null);
          p.ec.handleRedo();
        }}
        executeCommand={p.ec.executeCommand}
        handleAiPolish={() => void p.ai.handleAiPolish(p.contentRef.current)}
        handleAiGenerateOpen={p.ai.handleAiGenerateOpen}
        handleAiTags={() => void p.ai.handleAiTags(p.contentRef.current)}
        handlePreviewOpen={() => p.setShowPreviewModal(true)}
        aiBusy={p.ai.aiLoading}
        activePopover={p.popover.activePopover}
        setActivePopover={p.popover.setActivePopover}
        colorButtonRef={p.popover.colorButtonRef}
        sizeButtonRef={p.popover.sizeButtonRef}
        emojiButtonRef={p.popover.emojiButtonRef}
        currentTheme={p.currentThemeId}
        onThemeChange={p.handleThemeChange}
      />
      <MobileEditorToolbar
        onUndo={p.ec.handleUndo}
        onRedo={p.ec.handleRedo}
        executeCommand={p.ec.executeCommand}
        onAiPolish={() => void p.ai.handleAiPolish(p.contentRef.current)}
        onAiGenerate={p.ai.handleAiGenerateOpen}
        onAiTags={() => void p.ai.handleAiTags(p.contentRef.current)}
        aiBusy={p.ai.aiLoading}
        onColor={p.popover.handleColor}
        onSize={p.popover.handleSize}
        onInsertEmoji={p.ec.insertTextAtCursor}
        currentTheme={p.currentThemeId}
        onThemeChange={p.handleThemeChange}
        onPreview={() => p.setShowPreviewModal(true)}
      />
      <EditorArea
        content={p.ec.content}
        editorExtensions={p.editorExt.editorExtensions}
        publishContent={p.ec.publishContent}
        onCreateEditor={p.onCreateEditor}
        slashMenu={p.slashMenu.slashMenu}
        slashIndex={p.slashMenu.slashIndex}
        setSlashIndex={p.slashMenu.setSlashIndex}
        filteredSlashCommands={p.slashMenu.filteredSlashCommands}
        handleSlashAction={p.slashMenu.handleSlashAction}
        wikilinkMenu={p.wikilinkMenu.wikilinkMenu}
        wikilinkResults={p.wikilinkMenu.wikilinkResults}
        wikilinkLoading={p.wikilinkMenu.wikilinkLoading}
        wikilinkIndex={p.wikilinkMenu.wikilinkIndex}
        handleWikilinkSelect={p.wikilinkMenu.handleWikilinkSelect}
      />
    </section>
  );
}

function PreviewPane({ p }: { p: EditorShellFlatContract }) {
  const { previewRef, handlePreviewScroll } = p.scrollSync;
  return (
    <section
      aria-label="Markdown preview"
      className="relative h-full min-w-0 overflow-auto bg-muted/30 selection:bg-info/20"
      ref={previewRef}
      onScroll={handlePreviewScroll}
    >
      <div className="sticky top-0 z-10 hidden min-h-10 items-center justify-end border-b border-border bg-background/95 px-3 backdrop-blur-sm lg:flex">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-pressed={p.scrollSyncEnabled}
          onClick={() => p.setScrollSyncEnabled(!p.scrollSyncEnabled)}
        >
          Scroll sync {p.scrollSyncEnabled ? "on" : "off"}
        </Button>
      </div>
      {p.ec.previewPending && (
        <div role="status" className="sticky top-0 z-10 bg-info/10 px-3 py-1.5 text-center text-xs text-info lg:top-10">
          Updating preview…
        </div>
      )}
      <div className="min-h-full p-4 md:p-8 lg:p-12">
        <ReadingSurface className="p-6 md:p-10 lg:p-12">
          <MarkdownPreview
            content={p.ec.previewContent}
            outline={p.outline}
            showInlineToc={false}
            className="markdown-body h-auto overflow-visible bg-transparent p-0 text-foreground"
            enableMentionHoverPreview
          />
        </ReadingSurface>
      </div>
    </section>
  );
}
