"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useToast } from "@/components/ui/toast";
import {
  apiFetch,
  getAuthEmail,
  removeAuthEmail,
  removeAuthToken,
} from "@/lib/api";
import type { Document, Tag } from "@/types";
import { copyToClipboard } from "@/lib/clipboard";
import {
  NEW_NOTE_EDITOR_VIEW_MODE,
  saveEditorViewModePreference,
} from "@/lib/editor-view-mode";

import { DocsNavigationDrawer } from "./components/DocsNavigationDrawer";
import { DocumentGrid } from "./components/DocumentGrid";
import { ExportDialog } from "./components/ExportDialog";
import { HeaderBar } from "./components/HeaderBar";
import { ImportDialog } from "./components/ImportDialog";
import { Sidebar } from "./components/Sidebar";
import { useDocsData } from "./hooks/useDocsData";
import { useImportExport } from "./hooks/useImportExport";
import { useSidebarTags } from "./hooks/useSidebarTags";
import { useTagIndex } from "./hooks/useTagIndex";
import { generatePixelAvatar } from "./utils";

function useDocsFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [selectedTag, setSelectedTag] = useState(searchParams.get("tag_id") || "");
  const [showStarred, setShowStarred] = useState(searchParams.get("view") === "starred");
  const [showShared, setShowShared] = useState(searchParams.get("view") === "shared");

  const showAll = useCallback(() => {
    setSelectedTag("");
    setShowStarred(false);
    setShowShared(false);
    router.replace("/docs");
  }, [router]);
  const showStarredNotes = useCallback(() => {
    setSelectedTag("");
    setShowStarred(true);
    setShowShared(false);
    router.replace("/docs?view=starred");
  }, [router]);
  const showSharedNotes = useCallback(() => {
    setSelectedTag("");
    setShowStarred(false);
    setShowShared(true);
    router.replace("/docs?view=shared");
  }, [router]);
  const selectTag = useCallback((id: string) => {
    setSelectedTag(id);
    setShowStarred(false);
    setShowShared(false);
    router.replace(`/docs?tag_id=${encodeURIComponent(id)}`);
  }, [router]);
  const navigate = useCallback((href: string) => {
    if (href === "/docs") showAll();
    else if (href === "/docs?view=starred") showStarredNotes();
    else if (href === "/docs?view=shared") showSharedNotes();
    else router.push(href);
  }, [router, showAll, showSharedNotes, showStarredNotes]);
  const activeHref = selectedTag
    ? `/docs?tag_id=${selectedTag}`
    : showStarred
      ? "/docs?view=starred"
      : showShared
        ? "/docs?view=shared"
        : "/docs";

  return {
    search,
    setSearch,
    selectedTag,
    setSelectedTag,
    showStarred,
    setShowStarred,
    showShared,
    setShowShared,
    showAll,
    showStarredNotes,
    showSharedNotes,
    selectTag,
    navigate,
    activeHref,
  };
}

function useTagSuggestions(
  search: string,
  mergeTags: (tags: Tag[]) => void,
) {
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const requestIDRef = useRef(0);

  useEffect(() => {
    const query = search.startsWith("/") ? search.slice(1).trim() : "";
    if (!query) return;
    const requestID = ++requestIDRef.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ limit: "20", offset: "0", q: query });
      void apiFetch<Tag[]>(`/tags?${params.toString()}`, { signal: controller.signal })
        .then((result) => {
          if (requestIDRef.current !== requestID) return;
          setSuggestions(result);
          mergeTags(result);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          console.error(error);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [mergeTags, search]);

  return useMemo(() => {
    const query = search.startsWith("/") ? search.slice(1).trim().toLowerCase() : "";
    if (!query) return [];
    return suggestions.filter((tag) => tag.name.toLowerCase().includes(query));
  }, [search, suggestions]);
}

function useDocsPageTitle(
  filters: Pick<ReturnType<typeof useDocsFilters>, "selectedTag" | "showShared" | "showStarred">,
  tagIndex: Partial<Record<string, Tag>>,
) {
  const title = filters.selectedTag
    ? `${tagIndex[filters.selectedTag]?.name || "Tagged"} notes`
    : filters.showStarred
      ? "Starred notes"
      : filters.showShared
        ? "Shared notes"
        : "All notes";

  useEffect(() => {
    document.title = `${title} · Micro Note`;
  }, [title]);

  return title;
}

export default function DocsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const filters = useDocsFilters();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [identity, setIdentity] = useState({ email: "", avatar: "" });
  const navigationButtonRef = useRef<HTMLButtonElement>(null);
  const initialFetchRef = useRef(false);
  const creatingRef = useRef(false);
  const { tagIndex, tagIndexRef, mergeTags, fetchTagsByIDs, fetchTags } = useTagIndex();
  const filteredTags = useTagSuggestions(filters.search, mergeTags);
  const sidebar = useSidebarTags({ toast });
  const data = useDocsData({
    search: filters.search,
    selectedTag: filters.selectedTag,
    showStarred: filters.showStarred,
    showShared: filters.showShared,
    mergeTags,
    fetchTagsByIDs,
    tagIndexRef,
    toast,
  });
  const ie = useImportExport({
    fetchOverview: data.fetchOverview,
    fetchTags,
    fetchSidebarTags: sidebar.fetchSidebarTags,
    tagSearch: sidebar.tagSearch,
    toast,
  });
  const pageTitle = useDocsPageTitle(filters, tagIndex);

  useEffect(() => {
    const email = getAuthEmail() || "";
    setIdentity({
      email,
      avatar: generatePixelAvatar(email || "anon"),
    });
  }, []);

  useEffect(() => {
    if (!filters.selectedTag || tagIndex[filters.selectedTag]) return;
    void fetchTagsByIDs([filters.selectedTag]);
  }, [fetchTagsByIDs, filters.selectedTag, tagIndex]);

  useEffect(() => {
    if (initialFetchRef.current) return;
    initialFetchRef.current = true;
    void fetchTags("");
    void data.fetchOverview();
    void data.fetchSharedCount();
  }, [data, fetchTags]);

  useEffect(() => {
    const oauthStatus = searchParams.get("oauth");
    if (!oauthStatus) return;
    const provider = searchParams.get("provider") || "Provider";
    if (oauthStatus === "bound") {
      toast({ description: `${provider} bound successfully.`, variant: "success" });
    } else if (oauthStatus === "conflict") {
      toast({ description: "This provider is already linked to another account.", variant: "error" });
    } else {
      toast({ description: "Failed to bind provider.", variant: "error" });
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("oauth");
    params.delete("provider");
    router.replace(params.size ? `/docs?${params.toString()}` : "/docs");
  }, [router, searchParams, toast]);

  const handleCreate = async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    try {
      const doc = await apiFetch<Document>("/documents", {
        method: "POST",
        body: JSON.stringify({ title: "Untitled", content: "" }),
      });
      saveEditorViewModePreference(NEW_NOTE_EDITOR_VIEW_MODE);
      router.push(`/docs/${doc.id}`);
    } catch {
      toast({ description: "Failed to create document.", variant: "error" });
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };
  const handleLogout = () => {
    removeAuthToken();
    removeAuthEmail();
    router.replace("/login");
  };
  const handleCopyShare = async (token: string) => {
    const copied = await copyToClipboard(`${window.location.origin}/share/${token}`);
    toast({
      description: copied ? "Share link copied." : "Failed to copy link.",
      variant: copied ? "success" : "error",
    });
  };

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground lg:flex-row">
      <Sidebar
        selectedTag={filters.selectedTag}
        showStarred={filters.showStarred}
        showShared={filters.showShared}
        totalDocs={data.totalDocs}
        starredTotal={data.starredTotal}
        sharedTotal={data.sharedTotal}
        recentDocs={data.recentDocs}
        sidebarTags={sidebar.sidebarTags}
        sidebarLoading={sidebar.sidebarLoading}
        sidebarHasMore={sidebar.sidebarHasMore}
        tagSearch={sidebar.tagSearch}
        sidebarScrollRef={sidebar.sidebarScrollRef}
        tagListRef={sidebar.tagListRef}
        onSelectTag={filters.selectTag}
        onShowAll={filters.showAll}
        onShowStarred={filters.showStarredNotes}
        onShowShared={filters.showSharedNotes}
        onTagSearchChange={sidebar.setTagSearch}
        onToggleTagPin={sidebar.handleToggleTagPin}
        onAutoLoadTags={sidebar.maybeAutoLoadTags}
      />
      <main aria-labelledby="docs-page-title" className="flex min-w-0 flex-1 flex-col">
        <h1 id="docs-page-title" className="sr-only">{pageTitle}</h1>
        <HeaderBar
          search={filters.search}
          selectedTag={filters.selectedTag}
          tagIndex={tagIndex}
          filteredTags={filteredTags}
          avatarUrl={identity.avatar}
          userEmail={identity.email}
          creating={creating}
          navigationButtonRef={navigationButtonRef}
          onOpenNavigation={() => setNavigationOpen(true)}
          onSearchChange={filters.setSearch}
          onClearSearch={() => filters.setSearch("")}
          onSetSelectedTag={filters.selectTag}
          onSetShowStarred={filters.setShowStarred}
          onSetShowShared={filters.setShowShared}
          onNavigate={(path) => filters.navigate(path)}
          onCreate={() => void handleCreate()}
          onLogout={handleLogout}
          onOpenImport={ie.openImportModal}
          onOpenExport={ie.openExportModal}
        />
        <DocumentGrid
          {...data}
          search={filters.search}
          selectedTag={filters.selectedTag}
          showStarred={filters.showStarred}
          showShared={filters.showShared}
          tagIndex={tagIndex}
          onCreate={() => void handleCreate()}
          onClearSearch={() => filters.setSearch("")}
          onClearFilter={filters.showAll}
          onRetryInitial={data.retryInitial}
          onRetryLoadMore={data.retryLoadMore}
          onPinToggle={(doc) => void data.handlePinToggle(doc)}
          onStarToggle={(doc) => void data.handleStarToggle(doc)}
          onCopyShare={(token) => void handleCopyShare(token)}
        />
      </main>
      <ImportDialog
        open={ie.importOpen}
        importStep={ie.importStep}
        importMode={ie.importMode}
        importSource={ie.importSource}
        importPreview={ie.importPreview}
        importReport={ie.importReport}
        importError={ie.importError}
        importFileName={ie.importFileName}
        importProgress={ie.importProgress}
        onSetImportMode={ie.setImportMode}
        onClose={ie.closeImportModal}
        onImportFile={ie.handleImportFile}
        onImportConfirm={ie.handleImportConfirm}
      />
      <ExportDialog
        open={ie.exportOpen}
        exporting={ie.exporting}
        error={ie.exportError}
        onClose={ie.closeExportModal}
        onExport={ie.handleExportNotes}
      />
      <DocsNavigationDrawer
        open={navigationOpen}
        activeHref={filters.activeHref}
        selectedTag={filters.selectedTag}
        recentDocs={data.recentDocs}
        tags={sidebar.sidebarTags}
        returnFocusRef={navigationButtonRef}
        onClose={() => setNavigationOpen(false)}
        onNavigate={filters.navigate}
        onSelectTag={filters.selectTag}
      />
      <span className="sr-only" aria-live="polite">
        {creating ? "Creating note" : ""}
      </span>
    </div>
  );
}
