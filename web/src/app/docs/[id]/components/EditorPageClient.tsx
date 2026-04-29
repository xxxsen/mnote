"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { EditorView } from "@codemirror/view";
import { getThemeById, loadThemePreference, saveThemePreference, type ThemeId } from "@/lib/editor-themes";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import type { DocumentVersionSummary } from "@/types";

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
  const [saving, setSaving] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<"summary" | "history" | "share">("summary");
  const [currentThemeId, setCurrentThemeId] = useState<ThemeId>(loadThemePreference);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const preview = usePreviewDoc({ onError: () => { toast({ description: "Failed to load document preview", variant: "error" }); } });
  const share = useShareLink({ docId, onError: (err) => { toast({ description: err instanceof Error ? err : "Share action failed", variant: "error" }); } });
  const quickOpen = useQuickOpen({ onSelectDocument: (doc) => { router.push(`/docs/${doc.id}`); } });
  const documentActions = useDocumentActions(docId);
  const tagActionsHook = useTagActions(docId);
  const tagState = useTagState({ tagActions: tagActionsHook, toast, setLastSavedAt });

  const notifyAi = useCallback((message: string) => { toast({ description: message }); }, [toast]);
  const ai = useAiAssistant({ docId, maxTags: MAX_TAGS, normalizeTagName, isValidTagName, notify: notifyAi });
  const sim = useSimilarDocs({ docId, title });

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
    id: docId, saving, hasUnsavedChanges: ec.hasUnsavedChanges, contentRef, lastSavedContentRef, documentActions, extractTitleFromContent,
    onLoadingChange: setLoading,
    onLoaded: ({ initialContent, detail, hasDraftOverride }) => {
      ec.setContent(initialContent); ec.setPreviewContent(initialContent); ec.setHasUnsavedChanges(hasDraftOverride);
      setTitle(extractTitleFromContent(initialContent));
      setSummary(detail.document.summary || ""); setStarred(detail.document.starred || 0);
      tagState.setSelectedTagIDs(detail.tag_ids); tagState.setAllTags(detail.tags ?? []);
      setLastSavedAt(detail.document.mtime);
      const text = initialContent || "";
      ec.setCharCount(text.length); ec.setWordCount(text.trim().split(/\s+/).filter((w) => w.length > 0).length);
    },
    onLoadError: (err) => { toast({ description: err instanceof Error ? err : "Document not found", variant: "error" }); router.push("/docs"); },
    onAutoSaved: ({ title: derivedTitle, timestamp }) => { setTitle(derivedTitle); setLastSavedAt(timestamp); ec.setHasUnsavedChanges(false); },
  });

  useEffect(() => { inlineTag.setInlineTagMode(false); inlineTag.setInlineTagValue(""); }, [docId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleThemeChange = useCallback((themeId: ThemeId) => {
    setCurrentThemeId(themeId); saveThemePreference(themeId);
    const view = editorViewRef.current;
    if (view) view.dispatch({ effects: themeCompartment.reconfigure(getThemeById(themeId).extension) });
  }, []);

  const handleSave = useCallback(async () => {
    const latestContent = contentRef.current;
    const derivedTitle = extractTitleFromContent(latestContent);
    if (!derivedTitle) { toast({ description: "Please add a title using markdown heading (Title + ===)." }); return; }
    setSaving(true);
    try {
      await documentActions.saveDocument(derivedTitle, latestContent);
      lastSavedContentRef.current = latestContent;
      setTitle(derivedTitle); setLastSavedAt(Math.floor(Date.now() / 1000)); ec.setHasUnsavedChanges(false);
      if (typeof window !== "undefined") window.localStorage.removeItem(`mnote:draft:${docId}`);
    } catch (err) {
      console.error(err);
      toast({ description: err instanceof Error ? err : "Failed to save", variant: "error" });
    } finally { setSaving(false); }
  }, [documentActions, docId, toast, ec, contentRef, lastSavedContentRef]);

  const handleDelete = useCallback(async () => {
    try { await documentActions.deleteDocument(); router.push("/docs"); }
    catch (err) { console.error(err); toast({ description: err instanceof Error ? err : "Failed to delete", variant: "error" }); }
  }, [documentActions, router, toast]);

  const handleStarToggle = useCallback(async () => {
    const next = starred ? 0 : 1; setStarred(next);
    try { await apiFetch(`/documents/${docId}/star`, { method: "PUT", body: JSON.stringify({ starred: next === 1 }) }); }
    catch (e) { console.error(e); setStarred(starred); }
  }, [docId, starred]);

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
  useEffect(() => { const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); void handleSave(); } }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [handleSave]);
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
      title={title} summary={summary} starred={starred} saving={saving}
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
