"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, removeAuthToken, removeAuthEmail, getAuthEmail } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import type { Document, Tag } from "@/types";
import type { SavedView } from "./types";
import { generatePixelAvatar, copyToClipboard } from "./utils";
import { useTagIndex } from "./hooks/useTagIndex";
import { useSidebarTags } from "./hooks/useSidebarTags";
import { useDocsData } from "./hooks/useDocsData";
import { useImportExport } from "./hooks/useImportExport";
import { useSavedViews } from "./hooks/useSavedViews";
import { Sidebar } from "./components/Sidebar";
import { HeaderBar } from "./components/HeaderBar";
import { DocumentGrid } from "./components/DocumentGrid";
import { ImportDialog } from "./components/ImportDialog";
import { ExportDialog } from "./components/ExportDialog";

export default function DocsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [selectedTag, setSelectedTag] = useState(searchParams.get("tag_id") || "");
  const [showStarred, setShowStarred] = useState(false);
  const [showShared, setShowShared] = useState(false);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [activeTagIndex, setActiveTagIndex] = useState(0);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [tagSuggestions, setTagSuggestions] = useState<Tag[]>([]);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const tagSelectorRef = useRef<HTMLDivElement>(null);
  const initialFetchRef = useRef(false);

  const filteredTags = tagSuggestions.filter(t =>
    t.name.toLowerCase().includes(search.slice(1).toLowerCase()),
  );

  const { tagIndex, tagIndexRef, mergeTags, fetchTagsByIDs, fetchTags } = useTagIndex();
  const sidebar = useSidebarTags({ toast });
  const {
    docs, recentDocs, totalDocs, starredTotal, sharedTotal,
    loading, loadingMore, hasMore, aiSearchDocs, aiSearching, loadMoreRef,
    fetchSummary, fetchSharedSummary, handlePinToggle, handleStarToggle,
  } = useDocsData({ search, selectedTag, showStarred, showShared, mergeTags, fetchTagsByIDs, tagIndexRef });
  const ie = useImportExport({ fetchSummary, fetchTags, fetchSidebarTags: sidebar.fetchSidebarTags, tagSearch: sidebar.tagSearch, toast });
  const { savedViews, fetchSavedViews, handleSaveCurrentView, removeSavedView } = useSavedViews({ toast });

  useEffect(() => { setActiveTagIndex(0); }, [search, showTagSelector]); // eslint-disable-line react-hooks/set-state-in-effect

  useEffect(() => { // eslint-disable-line react-hooks/set-state-in-effect
    const storedEmail = getAuthEmail();
    if (storedEmail) { setUserEmail(storedEmail); setAvatarUrl(generatePixelAvatar(storedEmail)); return; }
    setAvatarUrl(generatePixelAvatar("anon"));
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
        setShowCreateMenu(false);
      }
      if (tagSelectorRef.current && !tagSelectorRef.current.contains(event.target as Node)) {
        setShowTagSelector(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => { if (!showUserMenu) setShowImportMenu(false); }, [showUserMenu]); // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => { if (showUserMenu) setShowCreateMenu(false); }, [showUserMenu]); // eslint-disable-line react-hooks/set-state-in-effect

  const fetchTagSuggestions = useCallback(async (query: string) => {
    if (!query) { setTagSuggestions([]); return; }
    try {
      const params = new URLSearchParams();
      params.set("limit", "20");
      params.set("offset", "0");
      params.set("q", query);
      const res = await apiFetch<Tag[]>(`/tags?${params.toString()}`);
      setTagSuggestions(res || []); // eslint-disable-line @typescript-eslint/no-unnecessary-condition
      mergeTags(res || []); // eslint-disable-line @typescript-eslint/no-unnecessary-condition
    } catch (e) {
      console.error(e);
    }
  }, [mergeTags]);

  useEffect(() => {
    if (!showTagSelector) return;
    const query = search.startsWith("/") ? search.slice(1).trim() : "";
    const timer = setTimeout(() => { void fetchTagSuggestions(query); }, 150);
    return () => clearTimeout(timer);
  }, [fetchTagSuggestions, search, showTagSelector]);

  useEffect(() => { if (!showTagSelector) setTagSuggestions([]); }, [showTagSelector]); // eslint-disable-line react-hooks/set-state-in-effect

  useEffect(() => {
    if (!selectedTag || tagIndex[selectedTag]) return; // eslint-disable-line @typescript-eslint/no-unnecessary-condition
    void fetchTagsByIDs([selectedTag]);
  }, [fetchTagsByIDs, selectedTag, tagIndex]);

  useEffect(() => {
    if (initialFetchRef.current) return;
    initialFetchRef.current = true;
    void fetchTags("");
    void fetchSummary();
    void fetchSharedSummary();
    void fetchSavedViews();
  }, [fetchTags, fetchSummary, fetchSharedSummary, fetchSavedViews]);

  useEffect(() => {
    const oauthStatus = searchParams.get("oauth");
    if (!oauthStatus) return;
    const provider = searchParams.get("provider") || "Provider";
    if (oauthStatus === "bound") toast({ description: `${provider} bound successfully.` });
    else if (oauthStatus === "conflict") toast({ description: "This provider is already linked to another account.", variant: "error" });
    else toast({ description: "Failed to bind provider.", variant: "error" });
    const params = new URLSearchParams(searchParams.toString());
    params.delete("oauth");
    params.delete("provider");
    const next = params.toString();
    router.replace(next ? `/docs?${next}` : "/docs");
  }, [router, searchParams, toast]);

  const handleCreate = async () => {
    try {
      const doc = await apiFetch<Document>("/documents", {
        method: "POST",
        body: JSON.stringify({ title: "Untitled", content: "" }),
      });
      router.push(`/docs/${doc.id}`);
    } catch (err) {
      console.error(err);
      toast({ description: err instanceof Error ? err : "Failed to create document", variant: "error" });
    }
  };

  const handleLogout = () => { removeAuthToken(); removeAuthEmail(); router.push("/login"); };

  const handleCopyShare = useCallback(async (token: string) => {
    try {
      const url = `${window.location.origin}/share/${token}`;
      const copied = await copyToClipboard(url);
      if (copied) toast({ description: "Share link copied" });
      else toast({ description: "Failed to copy link", variant: "error" });
    } catch (err) {
      console.error(err);
      toast({ description: err instanceof Error ? err : "Failed to copy link", variant: "error" });
    }
  }, [toast]);

  const handleApplySavedView = useCallback((view: SavedView) => {
    setSearch(view.search || "");
    setSelectedTag(view.selectedTag || "");
    setShowStarred(view.showStarred);
    setShowShared(view.showShared);
    setShowTagSelector(false);
  }, []);

  const navigate = useCallback((path: string) => router.push(path), [router]);

  return (
    <div className="flex h-screen flex-col md:flex-row bg-background text-foreground">
      <Sidebar
        selectedTag={selectedTag} showStarred={showStarred} showShared={showShared}
        totalDocs={totalDocs} starredTotal={starredTotal} sharedTotal={sharedTotal}
        recentDocs={recentDocs} tagIndex={tagIndex} savedViews={savedViews} search={search}
        sidebarTags={sidebar.sidebarTags} sidebarLoading={sidebar.sidebarLoading} sidebarHasMore={sidebar.sidebarHasMore}
        tagSearch={sidebar.tagSearch} sidebarScrollRef={sidebar.sidebarScrollRef} tagListRef={sidebar.tagListRef}
        onSelectTag={(id) => { setSelectedTag(id); setShowStarred(false); setShowShared(false); }}
        onShowAll={() => { setSelectedTag(""); setShowStarred(false); setShowShared(false); }}
        onShowStarred={() => { setSelectedTag(""); setShowStarred(true); setShowShared(false); }}
        onShowShared={() => { setSelectedTag(""); setShowStarred(false); setShowShared(true); }}
        onNavigate={navigate}
        onTagSearchChange={sidebar.setTagSearch}
        onSaveCurrentView={() => handleSaveCurrentView({ search, selectedTag, showStarred, showShared })}
        onApplySavedView={handleApplySavedView}
        onRemoveSavedView={removeSavedView}
        onToggleTagPin={sidebar.handleToggleTagPin}
        onAutoLoadTags={sidebar.maybeAutoLoadTags}
      />
      <main className="flex-1 flex flex-col min-w-0">
        <HeaderBar
          search={search} selectedTag={selectedTag} tagIndex={tagIndex}
          showTagSelector={showTagSelector} activeTagIndex={activeTagIndex} filteredTags={filteredTags}
          showUserMenu={showUserMenu} showCreateMenu={showCreateMenu} showImportMenu={showImportMenu}
          avatarUrl={avatarUrl} userEmail={userEmail} menuRef={menuRef} tagSelectorRef={tagSelectorRef}
          onSearchChange={setSearch} onClearSearch={() => setSearch("")}
          onSetSelectedTag={setSelectedTag} onSetShowTagSelector={setShowTagSelector}
          onSetActiveTagIndex={setActiveTagIndex} onSetShowStarred={setShowStarred} onSetShowShared={setShowShared}
          onSetShowUserMenu={setShowUserMenu} onSetShowCreateMenu={setShowCreateMenu} onSetShowImportMenu={setShowImportMenu}
          onNavigate={navigate} onCreate={handleCreate} onLogout={handleLogout}
          onOpenImport={ie.openImportModal} onOpenExport={ie.openExportModal}
        />
        <DocumentGrid
          docs={docs} aiSearchDocs={aiSearchDocs} aiSearching={aiSearching}
          loading={loading} loadingMore={loadingMore} hasMore={hasMore}
          showShared={showShared} tagIndex={tagIndex} loadMoreRef={loadMoreRef}
          onNavigate={navigate} onPinToggle={handlePinToggle} onStarToggle={handleStarToggle}
          onCopyShare={handleCopyShare}
        />
      </main>
      {ie.importOpen && (
        <ImportDialog
          importStep={ie.importStep} importMode={ie.importMode} importSource={ie.importSource}
          importPreview={ie.importPreview} importReport={ie.importReport}
          importError={ie.importError} importFileName={ie.importFileName} importProgress={ie.importProgress}
          onSetImportMode={ie.setImportMode} onClose={ie.closeImportModal}
          onImportFile={ie.handleImportFile} onImportConfirm={ie.handleImportConfirm}
        />
      )}
      {ie.exportOpen && (
        <ExportDialog onClose={ie.closeExportModal} onExport={ie.handleExportNotes} />
      )}
    </div>
  );
}
