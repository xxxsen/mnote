"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { EditorView } from "@codemirror/view";
import { getThemeById, loadThemePreference, saveThemePreference, type ThemeId } from "@/lib/editor-themes";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import type { DocumentVersionSummary } from "@/types";

import { MAX_TAGS } from "../constants";
import { extractTitleFromContent, downloadFile, normalizeTagName, isValidTagName, decideSavedSync } from "../utils";

import { useDocumentActions } from "../hooks/useDocumentActions";
import { useTagActions } from "../hooks/useTagActions";
import { useQuickOpen } from "../hooks/useQuickOpen";
import { useShareLink } from "../hooks/useShareLink";
import { usePreviewDoc } from "../hooks/usePreviewDoc";
import { useAiAssistant } from "../hooks/useAiAssistant";
import { useSimilarDocs } from "../hooks/useSimilarDocs";
import { useEditorLifecycle } from "../hooks/useEditorLifecycle";
import { useEditorSaveQueue } from "../hooks/useEditorSaveQueue";
import { useScrollSync } from "../hooks/useScrollSync";
import { useEditorContent } from "../hooks/useEditorContent";
import { useSlashMenu } from "../hooks/useSlashMenu";
import { useWikilinkMenu } from "../hooks/useWikilinkMenu";
import { useInlineTag } from "../hooks/useInlineTag";
import { useFloatingPanel } from "../hooks/useFloatingPanel";
import { useLinkGraph } from "../hooks/useLinkGraph";
import { useEditorExtensions, themeCompartment } from "../hooks/useEditorExtensions";
import { usePopover } from "../hooks/usePopover";
import { useTagState } from "../hooks/useTagState";
import { useFilePaste } from "../hooks/useFilePaste";
import { EditorPageLayout } from "./EditorPageLayout";

type EditorPageClientProps = { docId: string };

// buildDraftPayload is intentionally defined at module scope so the
// Date.now() call inside it stays out of any React render scope. The
// editor's onSaved callback writes a localStorage draft from a Promise
// resolution, which is logically post-render, but the
// react-hooks/purity rule flags impure calls inside callbacks defined
// during render. Routing the timestamp read through this helper keeps
// the rule happy without weakening the staleness guarantee — Date.now()
// is still called at the moment the draft is written, not earlier.
function buildDraftPayload(content: string): string {
  return JSON.stringify({ content, updatedAt: Date.now() });
}

export function EditorPageClient({ docId }: EditorPageClientProps) {
  const router = useRouter();
  const { toast } = useToast();

  const editorViewRef = useRef<EditorView | null>(null);
  const contentRef = useRef<string>("");
  const lastSavedContentRef = useRef<string>("");
  const pasteHandlerRef = useRef<((event: ClipboardEvent) => void) | null>(null);
  const editorKeydownHandlerRef = useRef<((event: KeyboardEvent) => void) | null>(null);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [starred, setStarred] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<"summary" | "history" | "share">("summary");
  const [currentThemeId, setCurrentThemeId] = useState<ThemeId>(loadThemePreference);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const preview = usePreviewDoc({ onError: () => { toast({ description: "Failed to load document preview", variant: "error" }); } });
  const share = useShareLink({ docId, onError: (err) => { toast({ description: err instanceof Error ? err : "Share action failed", variant: "error" }); } });
  const quickOpen = useQuickOpen({ onSelectDocument: (doc) => { router.push(`/docs/${doc.id}`); } });
  const documentActions = useDocumentActions(docId);
  const tagActionsHook = useTagActions(docId);

  const notifyAi = useCallback((message: string) => { toast({ description: message }); }, [toast]);
  const ai = useAiAssistant({ docId, maxTags: MAX_TAGS, normalizeTagName, isValidTagName, notify: notifyAi });
  const sim = useSimilarDocs({ docId, title });

  const saveQueue = useEditorSaveQueue({
    // Seed at 1 because the documents table defaults content_revision to 1.
    // The real revision (which may be much higher on legacy documents that
    // were backfilled from MAX(version)) is published synchronously via
    // resyncRevision in the onLoaded callback below, before the user can
    // trigger any save action.
    initialRevision: 1,
    initialSavedContent: "",
    initialSavedTitle: "",
    save: (snapshot, saveSeq) => documentActions.saveDocument(snapshot.title, snapshot.content, saveSeq),
    onSaved: ({ snapshot, isLatest }) => {
      // Always advance lastSavedContentRef to the snapshot the server
      // just accepted so the queue's "skip no-op" guard works against
      // the latest persisted state on the next requestSave. The
      // remaining bookkeeping — whether to clear hasUnsavedChanges and
      // drop the localStorage draft — depends on whether the snapshot
      // is still the editor's authoritative state. See decideSavedSync.
      lastSavedContentRef.current = snapshot.content;
      const currentContent = contentRef.current;
      const currentTitle = extractTitleFromContent(currentContent);
      const action = decideSavedSync({
        snapshotContent: snapshot.content,
        snapshotTitle: snapshot.title,
        currentContent,
        currentTitle,
        isLatest,
      });
      if (action === "clear") {
        setTitle(snapshot.title);
        ec.setHasUnsavedChanges(false);
        if (typeof window !== "undefined") {
          window.localStorage.removeItem(`mnote:draft:${docId}`);
        }
        return;
      }
      // Keep the surfaced title aligned with the editor's contentRef so
      // the tab label does not flicker back to the older snapshot's
      // title while a newer save is in flight; hasUnsavedChanges stays
      // true so the footer keeps showing "unsynced" until the follow-up
      // save catches up, and we re-publish the current draft to
      // localStorage so a crash here does not lose in-progress edits.
      setTitle(currentTitle);
      ec.setHasUnsavedChanges(true);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`mnote:draft:${docId}`, buildDraftPayload(currentContent));
      }
    },
    // A stale save_seq response is not a conflict — the server simply saw
    // a fresher save first. The queue has already fast-forwarded its local
    // save_seq, so we deliberately leave the editor's draft untouched and
    // do not surface a UI banner; the user's next save resumes against the
    // new save_seq.
    onError: (err) => {
      console.error(err);
      toast({ description: err instanceof Error ? err : "Failed to save", variant: "error" });
    },
  });
  const saving = saveQueue.status === "SAVING" || saveQueue.status === "QUEUED";
  const lastSavedAt = saveQueue.lastSavedAt;
  const setLastSavedAt = saveQueue.setLastSavedAt;
  const tagState = useTagState({ tagActions: tagActionsHook, toast, setLastSavedAt });

  const ec = useEditorContent({ editorViewRef, contentRef, lastSavedContentRef });
  const scrollSync = useScrollSync({ loading, editorViewRef });
  const popover = usePopover({ handleFormat: ec.handleFormat });
  const filePaste = useFilePaste({ insertTextAtCursor: ec.insertTextAtCursor, replacePlaceholder: ec.replacePlaceholder, toast });

  const slashMenu = useSlashMenu({ editorViewRef, handleFormat: ec.handleFormat, handleInsertTable: ec.handleInsertTable, insertTextAtCursor: ec.insertTextAtCursor });
  const wikilinkMenu = useWikilinkMenu({ editorViewRef, contentRef, lastSavedContentRef, schedulePreviewUpdate: ec.schedulePreviewUpdate, setContent: ec.setContent, setPreviewContent: ec.setPreviewContent, setHasUnsavedChanges: ec.setHasUnsavedChanges });
  const linkGraphHook = useLinkGraph({ docId, title, previewContent: ec.previewContent });
  const floatingPanel = useFloatingPanel({ docId, previewContent: ec.previewContent, summary, backlinks: linkGraphHook.backlinks, outboundLinks: linkGraphHook.outboundLinks });
  const inlineTag = useInlineTag({ allTags: tagState.allTags, selectedTagIDs: tagState.selectedTagIDs, tagActions: tagActionsHook, mergeTags: tagState.mergeTags, saveTagIDs: tagState.saveTagIDs, findExistingTagByName: tagState.findExistingTagByName, toast });
  const editorExt = useEditorExtensions({ currentThemeId, updateCursorInfo: ec.updateCursorInfo, startTransition: ec.startTransition, setSlashMenu: slashMenu.setSlashMenu, setWikilinkMenu: wikilinkMenu.setWikilinkMenu });

  useEditorLifecycle({
    id: docId, hasUnsavedChanges: ec.hasUnsavedChanges, contentRef, lastSavedContentRef, documentActions, extractTitleFromContent,
    onLoadingChange: setLoading,
    onLoaded: ({ initialContent, detail, hasDraftOverride }) => {
      ec.setContent(initialContent); ec.setPreviewContent(initialContent); ec.setHasUnsavedChanges(hasDraftOverride);
      setTitle(extractTitleFromContent(initialContent));
      setSummary(detail.document.summary || ""); setStarred(detail.document.starred || 0);
      tagState.setSelectedTagIDs(detail.tag_ids); tagState.setAllTags(detail.tags ?? []);
      // Rely on the dedicated content_revision/content_mtime fields so that
      // summary/tag/star mtime bumps cannot poison the save protocol's
      // optimistic concurrency check.
      saveQueue.resyncRevision({
        revision: detail.document.content_revision || 1,
        title: extractTitleFromContent(initialContent),
        content: detail.document.content,
        mtime: detail.document.content_mtime || detail.document.mtime || null,
      });
      const text = initialContent || "";
      ec.setCharCount(text.length); ec.setWordCount(text.trim().split(/\s+/).filter((w) => w.length > 0).length);
    },
    onLoadError: (err) => { toast({ description: err instanceof Error ? err : "Document not found", variant: "error" }); router.push("/docs"); },
    requestSave: saveQueue.requestSave,
  });

  useEffect(() => { inlineTag.setInlineTagMode(false); inlineTag.setInlineTagValue(""); }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleThemeChange = useCallback((themeId: ThemeId) => {
    setCurrentThemeId(themeId); saveThemePreference(themeId);
    const view = editorViewRef.current;
    if (view) view.dispatch({ effects: themeCompartment.reconfigure(getThemeById(themeId).extension) });
  }, []);

  const handleSave = useCallback(() => {
    const latestContent = contentRef.current;
    const derivedTitle = extractTitleFromContent(latestContent);
    if (!derivedTitle) { toast({ description: "Please add a title using markdown heading (Title + ===)." }); return; }
    // Hand the snapshot to the queue; the queue enforces single-flight
    // semantics so back-to-back Ctrl+S presses cannot create overlapping PUTs.
    saveQueue.requestSave({ title: derivedTitle, content: latestContent });
  }, [contentRef, toast, saveQueue]);

  const handleDelete = useCallback(async () => {
    try { await documentActions.deleteDocument(); router.push("/docs"); }
    catch (err) { console.error(err); toast({ description: err instanceof Error ? err : "Failed to delete", variant: "error" }); }
  }, [documentActions, router, toast]);

  const handleStarToggle = useCallback(async () => {
    const next = starred ? 0 : 1; setStarred(next);
    try { await apiFetch(`/documents/${docId}/star`, { method: "PUT", body: JSON.stringify({ starred: next === 1 }) }); }
    catch (e) {
      console.error(e);
      setStarred(starred);
      toast({ description: e instanceof Error ? e : "Failed to update star", variant: "error" });
    }
  }, [docId, starred, toast]);

  const handleExportMarkdown = useCallback(() => { downloadFile(contentRef.current, `${title || "untitled"}.md`, "text/markdown"); }, [title, contentRef]);
  const handleExportConfluenceHTML = useCallback(async () => {
    try {
      const result = await apiFetch<{ html: string }>("/export/confluence-html", { method: "POST", body: JSON.stringify({ document_id: docId }) });
      downloadFile(result.html, `${title || "untitled"}.confluence.html`, "text/html");
      toast({ description: "Confluence HTML downloaded." });
    } catch (err) { console.error(err); toast({ description: err instanceof Error ? err.message : "Failed to download Confluence HTML", variant: "error" }); }
  }, [docId, title, toast]);

  const handleApplyAiText = useCallback(() => {
    if (!ai.aiResultText) { ai.closeAiModal(); return; }
    ec.applyContent(ai.aiResultText); ai.closeAiModal();
  }, [ai, ec]);

  const handleRevert = useCallback((v: DocumentVersionSummary) => { router.push(`/docs/${docId}/revert?version=${v.version}`); }, [router, docId]);

  useEffect(() => { if (typeof document === "undefined") return; document.title = title ? `${title} - Micro Note` : "micro note"; }, [title]);
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); handleSave(); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [handleSave]);
  useEffect(() => { return () => { const view = editorViewRef.current; if (view && pasteHandlerRef.current) view.dom.removeEventListener("paste", pasteHandlerRef.current, true); }; }, []);
  useEffect(() => { return () => { if (ec.previewUpdateTimerRef.current) window.clearTimeout(ec.previewUpdateTimerRef.current); if (scrollSync.scrollSyncTimerRef.current) window.clearTimeout(scrollSync.scrollSyncTimerRef.current); }; }, [ec.previewUpdateTimerRef, scrollSync.scrollSyncTimerRef]);

  const onCreateEditor = useCallback((view: EditorView) => {
    editorViewRef.current = view;
    view.scrollDOM.addEventListener("scroll", scrollSync.handleEditorScroll);
    if (pasteHandlerRef.current) view.dom.removeEventListener("paste", pasteHandlerRef.current, true);
    const handler = (event: ClipboardEvent) => { void filePaste.handlePaste(event); };
    pasteHandlerRef.current = handler;
    view.dom.addEventListener("paste", handler, true);
    if (editorKeydownHandlerRef.current) view.dom.removeEventListener("keydown", editorKeydownHandlerRef.current, true);
    const keydownHandler = (e: KeyboardEvent) => {
      if (slashMenu.slashKeydownRef.current(e)) { e.preventDefault(); e.stopPropagation(); return; }
      if (wikilinkMenu.wikilinkKeydownRef.current(e)) { e.preventDefault(); e.stopPropagation(); return; }
    };
    editorKeydownHandlerRef.current = keydownHandler;
    view.dom.addEventListener("keydown", keydownHandler, true);
  }, [scrollSync.handleEditorScroll, filePaste, slashMenu.slashKeydownRef, wikilinkMenu.wikilinkKeydownRef]);

  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;

  return (
    <EditorPageLayout
      router={router} toast={toast} docId={docId} contentRef={contentRef}
      ec={ec} scrollSync={scrollSync} popover={popover} slashMenu={slashMenu} wikilinkMenu={wikilinkMenu}
      linkGraphHook={linkGraphHook} floatingPanel={floatingPanel} inlineTag={inlineTag} editorExt={editorExt}
      preview={preview} share={share} quickOpen={quickOpen} tagState={tagState} ai={ai} sim={sim} documentActions={documentActions}
      title={title} summary={summary} starred={starred} saving={saving} saveStatus={saveQueue.status}
      showDetails={showDetails} setShowDetails={setShowDetails} activeTab={activeTab} setActiveTab={setActiveTab}
      currentThemeId={currentThemeId} lastSavedAt={lastSavedAt}
      showDeleteConfirm={showDeleteConfirm} setShowDeleteConfirm={setShowDeleteConfirm}
      showPreviewModal={showPreviewModal} setShowPreviewModal={setShowPreviewModal}
      handleThemeChange={handleThemeChange} handleSave={handleSave} handleDelete={handleDelete}
      handleStarToggle={handleStarToggle} handleExportMarkdown={handleExportMarkdown}
      handleExportConfluenceHTML={handleExportConfluenceHTML} handleApplyAiText={handleApplyAiText}
      handleRevert={handleRevert} onCreateEditor={onCreateEditor} setSummary={setSummary} setLastSavedAt={setLastSavedAt}
    />
  );
}
