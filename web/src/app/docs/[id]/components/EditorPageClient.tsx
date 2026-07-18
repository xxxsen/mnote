"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { EditorView } from "@codemirror/view";
import { loadThemePreference, type ThemeId } from "@/lib/editor-themes";
import { useToast } from "@/components/ui/toast";
import { buildOutline } from "@/components/markdown-preview/helpers";
import type { DocDetail } from "../types";

import { MAX_TAGS } from "../constants";
import { extractTitleFromContent, downloadFile, normalizeTagName, isValidTagName } from "../utils";

import { useDocumentActions } from "../hooks/useDocumentActions";
import { useTagActions } from "../hooks/useTagActions";
import { useQuickOpen } from "../hooks/useQuickOpen";
import { useShareLink } from "../hooks/useShareLink";
import { usePreviewDoc } from "../hooks/usePreviewDoc";
import { useAiAssistant } from "../hooks/useAiAssistant";
import { useSimilarDocs } from "../hooks/useSimilarDocs";
import { useEditorLifecycle } from "../hooks/useEditorLifecycle";
import { useEditorSession } from "../hooks/useEditorSession";
import { useEditorViewMode } from "../hooks/useEditorViewMode";
import { useEditorDecisionActions, useEditorDecisionState } from "../hooks/useEditorDecisions";
import { useEditorDomBindings } from "../hooks/useEditorDomBindings";
import { useEditorPageActions } from "../hooks/useEditorPageActions";
import { useScrollSync } from "../hooks/useScrollSync";
import { useSlashMenu } from "../hooks/useSlashMenu";
import { useWikilinkMenu } from "../hooks/useWikilinkMenu";
import { useInlineTag } from "../hooks/useInlineTag";
import { useEditorContextRail } from "../hooks/useEditorContextRail";
import { useLinkGraph } from "../hooks/useLinkGraph";
import { useEditorExtensions } from "../hooks/useEditorExtensions";
import { usePopover } from "../hooks/usePopover";
import { useTagState } from "../hooks/useTagState";
import { useFilePaste } from "../hooks/useFilePaste";
import { EditorShell } from "./EditorShell";
import { DraftRecoveryDialog } from "./DraftRecoveryDialog";
import {
  SAVE_CONFLICT_DIALOG_TITLE,
  SaveConflictDialog,
} from "./SaveConflictDialog";

type EditorPageClientProps = { docId: string };

export function EditorPageClient({ docId }: EditorPageClientProps) {
  const router = useRouter();
  const { toast } = useToast();

  const editorViewRef = useRef<EditorView | null>(null);
  const contentRef = useRef<string>("");
  const lastSavedContentRef = useRef<string>("");
  const pasteHandlerRef = useRef<((event: ClipboardEvent) => void) | null>(null);
  const editorKeydownHandlerRef = useRef<((event: KeyboardEvent) => void) | null>(null);
  const setLastSavedContent = useCallback((content: string) => { lastSavedContentRef.current = content; }, []);
  const setEditorView = useCallback((view: EditorView) => { editorViewRef.current = view; }, []);
  const setPasteHandler = useCallback((handler: (event: ClipboardEvent) => void) => { pasteHandlerRef.current = handler; }, []);
  const setKeydownHandler = useCallback((handler: (event: KeyboardEvent) => void) => { editorKeydownHandlerRef.current = handler; }, []);

  const [summary, setSummary] = useState("");
  const [starred, setStarred] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentThemeId, setCurrentThemeId] = useState<ThemeId>(loadThemePreference);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const preview = usePreviewDoc({ onError: () => { toast({ description: "Failed to load document preview", variant: "error" }); } });
  const share = useShareLink({ docId, onError: (err) => { toast({ description: err instanceof Error ? err : "Share action failed", variant: "error" }); } });
  const documentActions = useDocumentActions(docId);
  const decisionState = useEditorDecisionState(documentActions);
  const tagActionsHook = useTagActions(docId);

  const notifyAi = useCallback((message: string) => { toast({ description: message }); }, [toast]);
  const ai = useAiAssistant({ docId, maxTags: MAX_TAGS, normalizeTagName, isValidTagName, notify: notifyAi });

  const session = useEditorSession({
    enabled: !loading && decisionState.draftRecovery === null,
    docId, editorViewRef, contentRef, lastSavedContentRef,
    initialRevision: 1, initialSavedContent: "", initialSavedTitle: "",
    save: (snapshot, saveSeq, baseRevision) => documentActions.saveDocument(snapshot.title, snapshot.content, baseRevision, saveSeq),
    extractTitle: extractTitleFromContent,
    onConflict: () => { void decisionState.loadConflict(); },
    onError: (err) => { toast({ description: err instanceof Error ? err : "Failed to save", variant: "error" }); },
  });
  const { flushDraftNow, removeLocalDraft } = session;
  const navigate = useCallback((path: string) => {
    flushDraftNow();
    router.push(path);
  }, [flushDraftNow, router]);
  const quickOpen = useQuickOpen({ onSelectDocument: (doc) => { navigate(`/docs/${doc.id}`); } });
  const ec = session.buffer;
  const saveQueue = session.saveQueue;
  const markLocalChanges = saveQueue.markLocalChanges;
  const setLastSavedAt = saveQueue.setLastSavedAt;
  const tagState = useTagState({ tagActions: tagActionsHook, toast, setLastSavedAt });
  const title = ec.draftTitle;
  const sim = useSimilarDocs({ docId, title });
  const viewPrefs = useEditorViewMode();
  const outline = useMemo(() => buildOutline(ec.previewContent), [ec.previewContent]);
  const contextRail = useEditorContextRail(docId);
  const scrollSync = useScrollSync({ loading, editorViewRef, enabled: viewPrefs.scrollSyncEnabled, outline, scopeKey: docId });
  const popover = usePopover({ handleFormat: ec.handleFormat });
  const filePaste = useFilePaste({ insertTextAtCursor: ec.insertTextAtCursor, replacePlaceholder: ec.replacePlaceholder, toast });

  const slashMenu = useSlashMenu({ editorViewRef, handleFormat: ec.handleFormat, executeCommand: ec.executeCommand, handleInsertTable: ec.handleInsertTable, insertTextAtCursor: ec.insertTextAtCursor });
  const wikilinkMenu = useWikilinkMenu({ editorViewRef, contentRef, lastSavedContentRef, schedulePreviewUpdate: ec.schedulePreviewUpdate, setContent: ec.setContent, setPreviewContent: ec.setPreviewContent, setHasUnsavedChanges: ec.setHasUnsavedChanges });
  const linkGraphHook = useLinkGraph({ docId, title, previewContent: ec.previewContent });
  const inlineTag = useInlineTag({ allTags: tagState.allTags, selectedTagIDs: tagState.selectedTagIDs, tagActions: tagActionsHook, mergeTags: tagState.mergeTags, saveTagIDs: tagState.saveTagIDs, findExistingTagByName: tagState.findExistingTagByName, toast });
  const editorExt = useEditorExtensions({ currentThemeId, updateCursorInfo: ec.updateCursorInfo, startTransition: ec.startTransition, setSlashMenu: slashMenu.setSlashMenu, setWikilinkMenu: wikilinkMenu.setWikilinkMenu });

  const initializeLoaded = (initialContent: string, detail: DocDetail, hasDraftOverride: boolean) => {
    ec.publishContent(initialContent, true);
    ec.setHasUnsavedChanges(hasDraftOverride);
    setSummary(detail.document.summary || ""); setStarred(detail.document.starred || 0);
    tagState.setSelectedTagIDs(detail.tag_ids); tagState.setAllTags(detail.tags ?? []);
    saveQueue.resyncRevision({
      revision: detail.document.content_revision || 1,
      hash: detail.document.content_hash || "",
      title: extractTitleFromContent(initialContent),
      content: detail.document.content,
      mtime: detail.document.content_mtime || detail.document.mtime || null,
    });
    if (hasDraftOverride) ec.setHasUnsavedChanges(true);
  };

  useEditorLifecycle({
    id: docId, hasUnsavedChanges: ec.hasUnsavedChanges, contentRef, lastSavedContentRef, documentActions, extractTitleFromContent,
    onLoadingChange: setLoading,
    onLoaded: ({ initialContent, detail, hasDraftOverride }) => initializeLoaded(initialContent, detail, hasDraftOverride),
    onRecoveryRequired: ({ draft, detail }) => decisionState.setDraftRecovery({ draft, detail }),
    onLoadError: (err) => { toast({ description: err instanceof Error ? err : "Document not found", variant: "error" }); router.push("/docs"); },
    requestSave: saveQueue.requestSave,
    managePersistence: false,
  });

  const decisionActions = useEditorDecisionActions({
    draftRecovery: decisionState.draftRecovery, setDraftRecovery: decisionState.setDraftRecovery,
    conflictServer: decisionState.conflictServer, clearConflict: decisionState.clearConflict,
    initializeLoaded, removeLocalDraft, contentRef, setLastSavedContent,
    applyContent: ec.applyContent, setDirty: ec.setHasUnsavedChanges,
    markLocalChanges, requestSave: saveQueue.requestSave,
    resyncRevision: saveQueue.resyncRevision, extractTitle: extractTitleFromContent,
    notify: (message) => toast({ description: message }),
  });

  const { setInlineTagMode, setInlineTagValue } = inlineTag;
  useEffect(() => {
    setInlineTagMode(false);
    setInlineTagValue("");
  }, [docId, setInlineTagMode, setInlineTagValue]);

  const pageActions = useEditorPageActions({
    docId, title, starred, setStarred, setTheme: setCurrentThemeId, editorViewRef, contentRef,
    extractTitle: extractTitleFromContent,
    notify: (message, error) => toast({ description: message, variant: error ? "error" : "default" }),
    navigate, navigateWithoutFlush: (path) => router.push(path), discardLocalDraft: removeLocalDraft,
    saveQueue, documentActions, ai, applyContent: ec.applyContent,
  });

  const handleResolveConflict = useCallback(() => {
    document
      .querySelector<HTMLElement>(
        `[role="dialog"][data-dialog-title="${SAVE_CONFLICT_DIALOG_TITLE}"]`,
      )
      ?.focus();
  }, []);

  const onCreateEditor = useEditorDomBindings({
    title, onSave: pageActions.handleSave, editorViewRef, setEditorView, pasteHandlerRef, setPasteHandler, keydownHandlerRef: editorKeydownHandlerRef, setKeydownHandler,
    handleEditorScroll: scrollSync.handleEditorScroll, handlePaste: filePaste.handlePaste,
    slashKeydownRef: slashMenu.slashKeydownRef, wikilinkKeydownRef: wikilinkMenu.wikilinkKeydownRef,
    previewTimerRef: ec.previewUpdateTimerRef, scrollFrameRef: scrollSync.scrollSyncTimerRef,
  });

  const recovery = decisionState.draftRecovery;
  if (loading) return <div className="flex h-dvh items-center justify-center">Loading...</div>;
  if (recovery) return (
    <DraftRecoveryDialog
      open localContent={recovery.draft.content} serverContent={recovery.detail.document.content}
      onUseServer={decisionActions.useRecoveredServer} onRecoverLocal={decisionActions.useRecoveredLocal}
      onDownloadLocal={() => downloadFile(recovery.draft.content, "local-draft.md", "text/markdown")}
    />
  );

  return (
    <>
    <EditorShell
      session={{
        contentRef, ec, title, saveStatus: saveQueue.status,
        titleMissing: session.titleMissing, localBackupUnavailable: session.localBackupUnavailable,
      }}
      commands={{
        scrollSync, popover, slashMenu, wikilinkMenu, editorExt,
        handleThemeChange: pageActions.handleThemeChange, handleSave: pageActions.handleSave,
        handleRetry: pageActions.handleRetry, handleResolveConflict, handleDelete: pageActions.handleDelete,
        handleStarToggle: pageActions.handleStarToggle, handleExportMarkdown: pageActions.handleExportMarkdown,
        handleExportConfluenceHTML: pageActions.handleExportConfluenceHTML, handleApplyAiText: pageActions.handleApplyAiText,
        handleRevert: pageActions.handleRevert, onCreateEditor, setSummary, setLastSavedAt,
      }}
      ui={{
        navigate, toast, linkGraphHook, outline, contextRail, inlineTag, preview, share, quickOpen, tagState, ai, sim, documentActions,
        summary, starred, currentThemeId,
        showDeleteConfirm, setShowDeleteConfirm, showPreviewModal, setShowPreviewModal,
        viewMode: viewPrefs.viewMode, setViewMode: viewPrefs.setViewMode,
        splitRatio: viewPrefs.splitRatio, setSplitRatio: viewPrefs.setSplitRatio,
        scrollSyncEnabled: viewPrefs.scrollSyncEnabled, setScrollSyncEnabled: viewPrefs.setScrollSyncEnabled,
      }}
    />
    <SaveConflictDialog
      open={saveQueue.status === "CONFLICT"}
      localContent={ec.content} serverContent={decisionState.conflictServer?.document.content ?? null}
      loading={decisionState.conflictLoading} error={decisionState.conflictError}
      onRetryLoad={() => void decisionState.loadConflict()} onUseServer={decisionActions.useConflictServer}
      onKeepMine={decisionActions.keepConflictDraft}
      onDownloadMine={() => downloadFile(contentRef.current, "local-draft.md", "text/markdown")}
    />
    </>
  );
}
