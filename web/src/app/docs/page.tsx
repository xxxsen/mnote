"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, removeAuthEmail, removeAuthToken, getAuthEmail, getAuthToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Document, Tag } from "@/types";
import { ChevronDown, ChevronRight, Copy, Download, FileArchive, LogOut, Pencil, Pin, Search, Settings, Share2, Star, Upload, X } from "lucide-react";

function TagEditor({
  doc,
  allTags,
  onSave,
  onClose,
}: {
  doc: DocumentWithTags;
  allTags: Tag[];
  onSave: (doc: DocumentWithTags, ids: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(doc.tag_ids || []);
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const timerRef = useRef<number | null>(null);
  const lastQueryRef = useRef("");
  const tagLookup = useRef<Record<string, Tag>>({});

  const normalizedQuery = query.trim();
  const suggestionList = suggestions.filter((tag) => !selected.includes(tag.id));
  const exactMatch = suggestionList.find((tag) => tag.name === normalizedQuery) || allTags.find((tag) => tag.name === normalizedQuery) || null;
  useEffect(() => {
    const next: Record<string, Tag> = {};
    allTags.forEach((tag) => {
      next[tag.id] = tag;
    });
    (doc.tags || []).forEach((tag) => {
      next[tag.id] = tag;
    });
    tagLookup.current = next;
  }, [allTags, doc.tags]);
  const dropdownItems = (() => {
    if (!normalizedQuery || searching) return [] as Array<{ type: "use" | "create" | "suggestion"; tag?: Tag; key: string }>;
    const items: Array<{ type: "use" | "create" | "suggestion"; tag?: Tag; key: string }> = [];
    if (exactMatch) {
      items.push({ type: "use", tag: exactMatch, key: `use-${exactMatch.id}` });
    } else {
      items.push({ type: "create", key: `create-${normalizedQuery}` });
    }
    suggestionList.forEach((tag) => {
      if (exactMatch && tag.id === exactMatch.id) return;
      items.push({ type: "suggestion", tag, key: `tag-${tag.id}` });
    });
    return items;
  })();
  const toggle = (id: string) => {
    if (selected.includes(id)) {
      setSelected(selected.filter((tagId) => tagId !== id));
      return;
    }
    if (selected.length >= 7) {
        toast({ description: "You can only select up to 7 tags." });
      return;
    }
    setSelected([...selected, id]);
  };

  const resetSearch = () => {
    setQuery("");
    setSuggestions([]);
    setActiveIndex(0);
  };

  const addTagByName = async (name: string) => {
    if (!name) return;
    const existing = suggestionList.find((tag) => tag.name === name) || allTags.find((tag) => tag.name === name) || null;
    if (existing) {
      tagLookup.current[existing.id] = existing;
      toggle(existing.id);
      resetSearch();
      return;
    }
    if (!/^[\p{Script=Han}A-Za-z0-9]{1,16}$/u.test(name)) {
      toast({ description: "Tags must be letters, numbers, or Chinese characters, and at most 16 characters." });
      return;
    }
    if (selected.length >= 7) {
      toast({ description: "You can only select up to 7 tags." });
      return;
    }
    try {
      const created = await apiFetch<Tag>("/tags", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      tagLookup.current[created.id] = created;
      setSelected((prev) => [...prev, created.id]);
      resetSearch();
    } catch (err) {
      console.error(err);
      toast({ description: "Failed to add tag", variant: "error" });
    }
  };

  useEffect(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }
    if (!normalizedQuery) {
      setSuggestions([]);
      setSearching(false);
      setActiveIndex(0);
      return;
    }
    setSearching(true);
    lastQueryRef.current = normalizedQuery;
    timerRef.current = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        params.set("q", normalizedQuery);
        params.set("limit", "5");
        const res = await apiFetch<Tag[]>(`/tags?${params.toString()}`);
        if (lastQueryRef.current !== normalizedQuery) return;
        setSuggestions(res || []);
      } catch (err) {
        console.error(err);
        if (lastQueryRef.current === normalizedQuery) {
          setSuggestions([]);
        }
      } finally {
        if (lastQueryRef.current === normalizedQuery) {
          setSearching(false);
          setActiveIndex(0);
        }
      }
    }, 200);
  }, [normalizedQuery]);

  return (
    <div className="absolute inset-0 bg-card z-20 flex flex-col p-3 gap-2 animate-in fade-in zoom-in-95 duration-200 overflow-visible" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted-foreground">Edit Tags</span>
        <button 
          onClick={(e) => { e.stopPropagation(); onClose(); }} 
          className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {selected.length === 0 ? (
            <div className="text-xs text-muted-foreground">No tags yet</div>
          ) : (
            selected.map((id) => {
              const tag = tagLookup.current[id];
              return (
                <button
                  key={id}
                  onClick={(e) => { e.stopPropagation(); toggle(id); }}
                  className="px-2 py-0.5 rounded-xl text-[10px] border border-transparent bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  #{tag?.name || id}
                </button>
              );
            })
          )}
        </div>
        <Input
          placeholder="Search tag..."
          value={query}
          maxLength={16}
          onChange={(e) => {
            const filtered = e.target.value.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "");
            setQuery(filtered);
          }}
          onKeyDown={(e) => {
            if (!dropdownItems.length) {
              if (e.key === "Enter") {
                addTagByName(normalizedQuery);
              }
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((prev) => (prev + 1) % dropdownItems.length);
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((prev) => (prev - 1 + dropdownItems.length) % dropdownItems.length);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              resetSearch();
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              const item = dropdownItems[activeIndex];
              if (!item) return;
              if (item.type === "create") {
                addTagByName(normalizedQuery);
              } else if (item.tag) {
                tagLookup.current[item.tag.id] = item.tag;
                toggle(item.tag.id);
                resetSearch();
              }
            }
          }}
        />
        {normalizedQuery && (
          <div className="border border-border rounded-xl overflow-hidden bg-background">
            {searching ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">Searching...</div>
            ) : dropdownItems.length > 0 ? (
              dropdownItems.map((item, index) => (
                <button
                  key={item.key}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 ${index === activeIndex ? "bg-muted/40" : ""}`}
                  onClick={() => {
                    if (item.type === "create") {
                      addTagByName(normalizedQuery);
                      return;
                    }
                    if (item.tag) {
                      tagLookup.current[item.tag.id] = item.tag;
                      toggle(item.tag.id);
                      resetSearch();
                    }
                  }}
                >
                  {item.type === "create"
                    ? `Create #${normalizedQuery}`
                    : item.type === "use"
                    ? `Use existing #${normalizedQuery}`
                    : `#${item.tag?.name || ""}`}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-xs text-muted-foreground">No matching tags</div>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{selected.length}/7 selected</span>
        <Button size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); onSave(doc, selected); }}>
          Save Changes
        </Button>
      </div>
    </div>
  );
}


function generatePixelAvatar(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  const color = "#" + "00000".substring(0, 6 - c.length) + c;
  
  let rects = "";
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if ((hash >> (y * 3 + x)) & 1) {
        rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}" />`;
        if (x < 2) rects += `<rect x="${4 - x}" y="${y}" width="1" height="1" fill="${color}" />`;
      }
    }
  }
  return `data:image/svg+xml;base64,${btoa(`<svg viewBox="0 0 5 5" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">${rects}</svg>`)}`;
}

interface DocumentWithTags extends Document {
  tag_ids?: string[];
  tags?: Tag[];
  share_token?: string;
}

interface TagSummary {
  id: string;
  name: string;
  pinned: number;
  count: number;
}

type ImportStep = "upload" | "parsing" | "preview" | "importing" | "done";
type ImportMode = "skip" | "overwrite" | "append";
type ImportSource = "hedgedoc" | "notes";

type SharedItem = {
  id: string;
  title: string;
  summary?: string;
  tag_ids?: string[];
  mtime: number;
  token: string;
};

type ImportPreview = {
  notes_count: number;
  tags_count: number;
  conflicts: number;
  samples: { title: string; tags: string[] }[];
};

type ImportReport = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  failed_titles: string[];
};


const sortDocs = (docs: DocumentWithTags[]) => {
  return [...docs].sort((a, b) => {
    if ((b.pinned || 0) !== (a.pinned || 0)) {
      return (b.pinned || 0) - (a.pinned || 0);
    }
    return (b.mtime || b.ctime || 0) - (a.mtime || a.ctime || 0);
  });
};

const sortRecentDocs = (docs: DocumentWithTags[]) => {
  return [...docs].sort((a, b) => {
    return (b.mtime || b.ctime || 0) - (a.mtime || a.ctime || 0);
  });
};

export default function DocsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [docs, setDocs] = useState<DocumentWithTags[]>([]);
  const [recentDocs, setRecentDocs] = useState<DocumentWithTags[]>([]);
  const [totalDocs, setTotalDocs] = useState(0);
  const [starredTotal, setStarredTotal] = useState(0);
  const [sharedTotal, setSharedTotal] = useState(0);
  const [tags, setTags] = useState<Tag[]>([]);
  const [sidebarTags, setSidebarTags] = useState<TagSummary[]>([]);
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [sidebarHasMore, setSidebarHasMore] = useState(true);
  const [sidebarOffset, setSidebarOffset] = useState(0);
  const sidebarFetchInFlightRef = useRef(false);
  const [tagSuggestions, setTagSuggestions] = useState<Tag[]>([]);
  const [tagIndex, setTagIndex] = useState<Record<string, Tag>>({});
  const tagFetchInFlightRef = useRef(false);
  const tagListRef = useRef<HTMLDivElement>(null);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const tagAutoLoadAtRef = useRef(0);
  const tagIndexRef = useRef<Record<string, Tag>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextOffset, setNextOffset] = useState(0);
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [selectedTag, setSelectedTag] = useState(searchParams.get("tag_id") || "");
  const [showStarred, setShowStarred] = useState(false);
  const [showShared, setShowShared] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showImportMenu, setShowImportMenu] = useState(false);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [activeTagIndex, setActiveTagIndex] = useState(0);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importStep, setImportStep] = useState<ImportStep>("upload");
  const [importMode, setImportMode] = useState<ImportMode>("append");
  const [importSource, setImportSource] = useState<ImportSource>("hedgedoc");
  const [exportOpen, setExportOpen] = useState(false);
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const fetchInFlightRef = useRef(false);
  const initialFetchRef = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const tagSelectorRef = useRef<HTMLDivElement>(null);

  const filteredTags = tagSuggestions.filter(t => t.name.toLowerCase().includes(search.slice(1).toLowerCase()));

  useEffect(() => {
    setActiveTagIndex(0);
  }, [search, showTagSelector]);

  useEffect(() => {
    tagIndexRef.current = tagIndex;
  }, [tagIndex]);

  useEffect(() => {
    const storedEmail = getAuthEmail();
    if (storedEmail) {
      setUserEmail(storedEmail);
      setAvatarUrl(generatePixelAvatar(storedEmail));
      return;
    }
    setAvatarUrl(generatePixelAvatar("anon"));
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
      if (tagSelectorRef.current && !tagSelectorRef.current.contains(event.target as Node)) {
        setShowTagSelector(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!showUserMenu) {
      setShowImportMenu(false);
    }
  }, [showUserMenu]);

  const mergeTags = useCallback((items: Tag[]) => {
    if (!items.length) return;
    setTagIndex((prev) => {
      const next = { ...prev };
      items.forEach((tag) => {
        next[tag.id] = tag;
      });
      return next;
    });
  }, []);

  const fetchTagsByIDs = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      try {
        const res = await apiFetch<Tag[]>("/tags/ids", {
          method: "POST",
          body: JSON.stringify({ ids }),
        });
        mergeTags(res || []);
      } catch (e) {
        console.error(e);
      }
    },
    [mergeTags]
  );

  const fetchDocs = useCallback(async (offset: number, append: boolean) => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      if (showShared) {
        const res = await apiFetch<{ items: SharedItem[] }>("/shares");
        const items = res?.items || [];
        const tagIDs = new Set<string>();
        setDocs(items.map((item) => ({
          id: item.id,
          user_id: "",
          title: item.title,
          content: item.summary || "",
          summary: item.summary || "",
          state: 1,
          pinned: 0,
          starred: 0,
          ctime: item.mtime,
          mtime: item.mtime,
          tags: [],
          tag_ids: item.tag_ids || [],
          share_token: item.token,
        } as DocumentWithTags)));
        items.forEach((item) => {
          (item.tag_ids || []).forEach((id) => tagIDs.add(id));
        });
        if (tagIDs.size > 0) {
          await fetchTagsByIDs(Array.from(tagIDs));
        }
        setHasMore(false);
        setNextOffset(0);
        return;
      }
      const query = new URLSearchParams();
      if (search) query.set("q", search);
      if (selectedTag) query.set("tag_id", selectedTag);
      if (showStarred) query.set("starred", "1");
      query.set("include", "tags");
      query.set("limit", "20");
      query.set("offset", String(offset));

      const res = await apiFetch<DocumentWithTags[]>(`/documents?${query.toString()}`);
      const enrichedDocs = (res || []).map((doc) => ({
        ...doc,
        tag_ids: doc.tag_ids || [],
        tags: doc.tags || [],
      }));
      const missingTagIDs = new Set<string>();
      const providedTagIDs = new Set<string>();
      const tagsFromDocs: Tag[] = [];
      enrichedDocs.forEach((doc) => {
        (doc.tags || []).forEach((tag) => {
          providedTagIDs.add(tag.id);
          tagsFromDocs.push(tag);
        });
        (doc.tag_ids || []).forEach((id) => {
          if (!providedTagIDs.has(id) && !tagIndexRef.current[id]) {
            missingTagIDs.add(id);
          }
        });
      });
      mergeTags(tagsFromDocs);
      await fetchTagsByIDs(Array.from(missingTagIDs));
      setDocs((prev) => {
        if (append) {
          return [...prev, ...enrichedDocs];
        }
        return sortDocs(enrichedDocs);
      });
      setHasMore((res || []).length === 20);
      setNextOffset(offset + (res || []).length);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      fetchInFlightRef.current = false;
    }
  }, [fetchTagsByIDs, mergeTags, search, selectedTag, showStarred, showShared]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await apiFetch<{ recent: Document[]; tag_counts: Record<string, number>; total: number; starred_total: number }>("/documents/summary?limit=5");
      setRecentDocs(sortRecentDocs((res?.recent || []) as DocumentWithTags[]));
      setTotalDocs(res?.total || 0);
      setStarredTotal(res?.starred_total || 0);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchSharedSummary = useCallback(async () => {
    try {
      const shared = await apiFetch<{ items: SharedItem[] }>("/shares");
      setSharedTotal(shared?.items?.length || 0);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchSidebarTags = useCallback(async (offset: number, append: boolean, query: string) => {
    if (sidebarFetchInFlightRef.current) return;
    sidebarFetchInFlightRef.current = true;
    setSidebarLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "20");
      params.set("offset", String(offset));
      if (query) {
        params.set("q", query);
      }
      const res = await apiFetch<TagSummary[]>(`/tags/summary?${params.toString()}`);
      const next = res || [];
      setSidebarTags((prev) => (append ? [...prev, ...next] : next));
      setSidebarHasMore(next.length === 20);
      setSidebarOffset(offset + next.length);
    } catch (e) {
      console.error(e);
    } finally {
      sidebarFetchInFlightRef.current = false;
      setSidebarLoading(false);
    }
  }, []);

  const handleToggleTagPin = useCallback(async (tag: TagSummary) => {
    const nextPinned = tag.pinned ? 0 : 1;
    try {
      await apiFetch(`/tags/${tag.id}/pin`, {
        method: "PUT",
        body: JSON.stringify({ pinned: nextPinned === 1 }),
      });
      setSidebarOffset(0);
      setSidebarHasMore(true);
      fetchSidebarTags(0, false, tagSearch.trim());
    } catch (e) {
      console.error(e);
      toast({ description: "Failed to update tag pin", variant: "error" });
    }
  }, [fetchSidebarTags, tagSearch, toast]);

  const fetchTags = useCallback(async (query: string) => {
    if (tagFetchInFlightRef.current) return;
    tagFetchInFlightRef.current = true;
    try {
      const params = new URLSearchParams();
      params.set("limit", "20");
      if (query) {
        params.set("q", query);
      }
      const res = await apiFetch<Tag[]>(`/tags?${params.toString()}`);
      const next = res || [];
      setTags(next);
      mergeTags(next);
    } catch (e) {
      console.error(e);
    } finally {
      tagFetchInFlightRef.current = false;
    }
  }, [mergeTags]);

  const fetchTagSuggestions = useCallback(async (query: string) => {
    if (!query) {
      setTagSuggestions([]);
      return;
    }
    try {
      const params = new URLSearchParams();
      params.set("limit", "20");
      params.set("offset", "0");
      params.set("q", query);
      const res = await apiFetch<Tag[]>(`/tags?${params.toString()}`);
      const next = res || [];
      setTagSuggestions(next);
      mergeTags(next);
    } catch (e) {
      console.error(e);
    }
  }, [mergeTags]);

  useEffect(() => {
    if (initialFetchRef.current) return;
    initialFetchRef.current = true;
    fetchTags("");
  }, [fetchTags]);

  useEffect(() => {
    setDocs([]);
    setHasMore(true);
    setNextOffset(0);
    setLoading(true);
    setLoadingMore(false);
    const timer = setTimeout(() => {
      fetchDocs(0, false);
      fetchSummary();
      fetchSharedSummary();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchDocs, fetchSummary, fetchSharedSummary, showStarred, showShared]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSidebarOffset(0);
      setSidebarHasMore(true);
      fetchSidebarTags(0, false, tagSearch.trim());
    }, 200);
    return () => clearTimeout(timer);
  }, [fetchSidebarTags, tagSearch]);


  useEffect(() => {
    if (!showTagSelector) return;
    const query = search.startsWith("/") ? search.slice(1).trim() : "";
    const timer = setTimeout(() => {
      void fetchTagSuggestions(query);
    }, 150);
    return () => clearTimeout(timer);
  }, [fetchTagSuggestions, search, showTagSelector]);

  useEffect(() => {
    if (showTagSelector) return;
    setTagSuggestions([]);
  }, [showTagSelector]);

  useEffect(() => {
    if (!selectedTag) return;
    if (tagIndex[selectedTag]) return;
    void fetchTagsByIDs([selectedTag]);
  }, [fetchTagsByIDs, selectedTag, tagIndex]);

  useEffect(() => {
    const oauthStatus = searchParams.get("oauth");
    if (!oauthStatus) return;
    const provider = searchParams.get("provider") || "Provider";
    if (oauthStatus === "bound") {
      toast({ description: `${provider} bound successfully.` });
    } else if (oauthStatus === "conflict") {
      toast({ description: "This provider is already linked to another account.", variant: "error" });
    } else {
      toast({ description: "Failed to bind provider.", variant: "error" });
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("oauth");
    params.delete("provider");
    const next = params.toString();
    router.replace(next ? `/docs?${next}` : "/docs");
  }, [router, searchParams, toast]);

  useEffect(() => {
    if (!loadMoreRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (!first?.isIntersecting) return;
        if (loading || loadingMore || !hasMore) return;
        fetchDocs(nextOffset, true);
      },
      { rootMargin: "200px" }
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [fetchDocs, hasMore, loading, loadingMore, nextOffset]);

  const handlePinToggle = async (e: React.MouseEvent, doc: DocumentWithTags) => {
    e.stopPropagation();
    const newPinned = doc.pinned ? 0 : 1;
    
    const updateDocs = (prevDocs: DocumentWithTags[]) => {
       const updated = prevDocs.map(d => d.id === doc.id ? { ...d, pinned: newPinned } : d);
       return sortDocs(updated);
    };

    setDocs(prev => updateDocs(prev));

    try {
      await apiFetch(`/documents/${doc.id}/pin`, {
        method: "PUT",
        body: JSON.stringify({ pinned: newPinned === 1 })
      });
    } catch (err) {
      console.error("Failed to pin document", err);
    }
  };

  const handleStarToggle = async (e: React.MouseEvent, doc: DocumentWithTags) => {
    e.stopPropagation();
    const newStarred = doc.starred ? 0 : 1;
    
    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, starred: newStarred } : d));

    try {
      await apiFetch(`/documents/${doc.id}/star`, {
        method: "PUT",
        body: JSON.stringify({ starred: newStarred === 1 })
      });
      void fetchSummary();
    } catch (err) {
      console.error("Failed to star document", err);
    }
  };

  const handleCreate = async () => {
    try {
      const doc = await apiFetch<Document>("/documents", {
        method: "POST",
        body: JSON.stringify({
          title: "Untitled",
          content: "",
        }),
      });
      router.push(`/docs/${doc.id}`);
    } catch (err) {
      console.error(err);
      toast({ description: "Failed to create document", variant: "error" });
    }
  };

  const handleUpdateTags = async (doc: DocumentWithTags, newTagIds: string[]) => {
    const updateDocs = (prevDocs: DocumentWithTags[]) => {
       return prevDocs.map(d => d.id === doc.id ? { ...d, tag_ids: newTagIds } : d);
    };
    setDocs(prev => updateDocs(prev));
    setEditingDocId(null);

    try {
      await apiFetch(`/documents/${doc.id}/tags`, {
        method: "PUT",
        body: JSON.stringify({
          tag_ids: newTagIds,
        })
      });
      void fetchSummary();
    } catch (err) {
      console.error("Failed to update tags", err);
    }
  };

  const loadMoreSidebarTags = useCallback(() => {
    if (sidebarLoading || !sidebarHasMore) return;
    fetchSidebarTags(sidebarOffset, true, tagSearch.trim());
  }, [fetchSidebarTags, sidebarHasMore, sidebarLoading, sidebarOffset, tagSearch]);

  const maybeAutoLoadTags = useCallback(() => {
    if (sidebarLoading || !sidebarHasMore) return;
    const now = Date.now();
    if (now - tagAutoLoadAtRef.current < 400) return;
    const container = sidebarScrollRef.current;
    if (!container) return;
    const nearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 40;
    const notScrollable = container.scrollHeight <= container.clientHeight + 1;
    if (nearBottom || notScrollable) {
      tagAutoLoadAtRef.current = now;
      loadMoreSidebarTags();
    }
  }, [loadMoreSidebarTags, sidebarHasMore, sidebarLoading]);


  const handleLogout = () => {
    removeAuthToken();
    removeAuthEmail();
    router.push("/login");
  };

  const formatRelativeTime = useCallback((timestamp?: number) => {
    if (!timestamp) return "";
    const now = Math.floor(Date.now() / 1000);
    const diff = Math.max(0, now - timestamp);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }, []);

  const resetImportState = useCallback(() => {
    setImportStep("upload");
    setImportMode("append");
    setImportJobId(null);
    setImportPreview(null);
    setImportReport(null);
    setImportError(null);
    setImportFileName(null);
    setImportProgress(0);
  }, []);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE || "/api/v1";

  const openImportModal = useCallback((source: ImportSource) => {
    resetImportState();
    setImportSource(source);
    setImportOpen(true);
  }, [resetImportState]);

  const closeImportModal = useCallback(() => {
    setImportOpen(false);
    resetImportState();
  }, [resetImportState]);

  const openExportModal = useCallback(() => {
    setExportOpen(true);
  }, []);

  const closeExportModal = useCallback(() => {
    setExportOpen(false);
  }, []);

  const handleImportFile = useCallback(async (file: File) => {
    setImportError(null);
    setImportFileName(file.name);
    setImportStep("parsing");
    try {
      const token = getAuthToken();
      const form = new FormData();
      form.append("file", file, file.name);
      const uploadRes = await fetch(`${apiBase}/import/${importSource}/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (uploadRes.status === 401) {
        removeAuthToken();
        window.location.href = "/login";
        return;
      }
      const payload = await uploadRes.json().catch(() => ({}));
      const code = payload?.code;
      if (typeof code === "number" && code !== 0) {
        const message = payload?.msg || "Upload failed";
        throw new Error(message);
      }
      const jobId = payload?.data?.job_id || payload?.job_id;
      if (!jobId) {
        throw new Error("Invalid upload response");
      }
      setImportJobId(jobId);
      const preview = await apiFetch<ImportPreview>(`/import/${importSource}/${jobId}/preview`);
      setImportPreview(preview);
      setImportStep("preview");
    } catch (err) {
      console.error(err);
      setImportError(err instanceof Error ? err.message : "Import failed");
      setImportStep("upload");
    }
  }, [apiBase, importSource]);

  const handleImportConfirm = useCallback(async () => {
    if (!importJobId) return;
    setImportError(null);
    setImportStep("importing");
    try {
      await apiFetch<{ ok: boolean }>(`/import/${importSource}/${importJobId}/confirm`, {
        method: "POST",
        body: JSON.stringify({ mode: importMode }),
      });
      let finished = false;
      while (!finished) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        const status = await apiFetch<{
          status: string;
          progress: number;
          report: ImportReport | null;
        }>(`/import/${importSource}/${importJobId}/status`);
        setImportProgress(status.progress);
        if (status.status === "done") {
          setImportReport(status.report || null);
          setImportStep("done");
          finished = true;
          void fetchSummary();
          fetchTags("");
          fetchSidebarTags(0, false, tagSearch.trim());
        }
      }
    } catch (err) {
      console.error(err);
      setImportError(err instanceof Error ? err.message : "Import failed");
      setImportStep("preview");
    }
  }, [fetchSidebarTags, fetchSummary, fetchTags, importJobId, importMode, importSource, tagSearch]);

  const handleExportNotes = useCallback(async () => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${apiBase}/export/notes`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 401) {
        removeAuthToken();
        window.location.href = "/login";
        return;
      }
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const payload = await res.json().catch(() => ({}));
        const code = payload?.code;
        if (typeof code === "number" && code !== 0) {
          throw new Error(payload?.msg || payload?.message || "Export failed");
        }
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const disposition = res.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="?([^";]+)"?/i);
      link.href = url;
      link.download = match?.[1] || "mnote-notes.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      toast({ description: err instanceof Error ? err.message : "Export failed", variant: "error" });
    }
  }, [apiBase, toast]);

  const handleCopyShare = useCallback(async (token: string) => {
    try {
      const url = `${window.location.origin}/share/${token}`;
      await navigator.clipboard.writeText(url);
      toast({ description: "Share link copied" });
    } catch (err) {
      console.error(err);
      toast({ description: "Failed to copy link", variant: "error" });
    }
  }, [toast]);

  return (
    <div className="flex h-screen flex-col md:flex-row bg-background text-foreground">
      <aside className="w-full md:w-64 border-r border-border p-4 flex-col gap-4 hidden md:flex">
        <div className="font-mono font-bold text-xl tracking-tighter mb-4">
          Micro Note
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold uppercase text-muted-foreground">General</div>
            </div>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => { setSelectedTag(""); setShowStarred(false); setShowShared(false); }}
                className={`group flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm font-medium transition-all ${
                  selectedTag === "" && !showStarred && !showShared
                    ? "bg-accent text-accent-foreground" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span>All Notes</span>
                <span className={`ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] transition-colors ${
                  selectedTag === "" && !showStarred && !showShared
                    ? "bg-background/20 text-accent-foreground"
                    : "bg-muted text-muted-foreground group-hover:bg-background group-hover:text-foreground"
                }`}>
                  {totalDocs}
                </span>
              </button>
              <button
                onClick={() => { setSelectedTag(""); setShowStarred(true); setShowShared(false); }}
                className={`group flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm font-medium transition-all ${
                  showStarred
                    ? "bg-accent text-accent-foreground" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <div className="flex items-center">
                  <Star className={`mr-2 h-4 w-4 ${showStarred ? "fill-current" : ""}`} />
                  <span>Starred</span>
                </div>
                <span className={`ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] transition-colors ${
                  showStarred
                    ? "bg-background/20 text-accent-foreground"
                    : "bg-muted text-muted-foreground group-hover:bg-background group-hover:text-foreground"
                }`}>
                  {starredTotal}
                </span>
                </button>
                <button
                  onClick={() => { setSelectedTag(""); setShowStarred(false); setShowShared(true); }}
                  className={`group flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm font-medium transition-all ${
                    showShared
                      ? "bg-accent text-accent-foreground" 
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center">
                    <Share2 className={`mr-2 h-4 w-4 ${showShared ? "fill-current" : ""}`} />
                    <span>Shared</span>
                  </div>
                  <span className={`ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] transition-colors ${
                    showShared
                      ? "bg-background/20 text-accent-foreground"
                      : "bg-muted text-muted-foreground group-hover:bg-background group-hover:text-foreground"
                  }`}>
                    {sharedTotal}
                  </span>
                </button>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold uppercase text-muted-foreground">RECENT UPDATES</div>
            </div>
            <style dangerouslySetInnerHTML={{__html: `
              @keyframes marquee {
                0% { transform: translateX(0); }
                100% { transform: translateX(-100%); }
              }
              .group:hover .marquee-text {
                animation: marquee 5s linear infinite;
              }
            `}} />
            <div className="flex flex-col gap-1">
              {recentDocs.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground italic opacity-50">
                  No recent notes
                </div>
              ) : (
                recentDocs.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => router.push(`/docs/${doc.id}`)}
                    className="group relative flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all text-left overflow-hidden"
                  >
                    <div className="relative flex-1 overflow-hidden mr-2">
                      <div className="truncate marquee-text w-fit">
                        {doc.title || "Untitled"}
                      </div>
                      <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover:block bg-popover text-popover-foreground text-[10px] px-2 py-1 rounded border shadow-md whitespace-nowrap pointer-events-none">
                        {doc.title || "Untitled"}
                      </div>
                    </div>
                    <span className="shrink-0 text-[10px] bg-muted-foreground/10 px-1.5 py-0.5 rounded-lg opacity-70 group-hover:opacity-100 transition-opacity">
                      {formatRelativeTime(doc.mtime)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-bold uppercase text-muted-foreground">Tags</div>
            <button 
              onClick={() => router.push(`/tags?return=${encodeURIComponent("/docs")}`)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Manage Tags"
            >
              <Settings className="h-3 w-3" />
            </button>
          </div>
          <div className="mb-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input 
                placeholder="Filter tags..." 
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                className="h-7 text-xs pl-7 bg-background/50 border-border focus-visible:ring-0 focus-visible:outline-none focus-visible:ring-offset-0"
              />
            </div>
          </div>
          <div
            ref={sidebarScrollRef}
            onScroll={maybeAutoLoadTags}
            onWheel={maybeAutoLoadTags}
            className="flex-1 overflow-y-auto no-scrollbar"
          >
            <div ref={tagListRef} className="flex flex-col gap-1">
              {sidebarTags.map((tag) => {
                return (
                  <button
                    key={tag.id}
                    onClick={() => { setSelectedTag(tag.id); setShowStarred(false); setShowShared(false); }}
                    className={`group flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm font-medium transition-all ${
                      selectedTag === tag.id
                        ? "bg-accent text-accent-foreground" 
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <span className="truncate">#{tag.name}</span>
                    <div className="ml-2 flex items-center gap-1">
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleTagPin(tag);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            handleToggleTagPin(tag);
                          }
                        }}
                        title={tag.pinned ? "Unpin tag" : "Pin tag"}
                        aria-label={tag.pinned ? "Unpin tag" : "Pin tag"}
                        className={`rounded p-1 transition-colors ${
                          tag.pinned
                            ? "text-primary opacity-100"
                            : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground"
                        }`}
                      >
                        <Pin className={`h-3 w-3 ${tag.pinned ? "fill-current" : ""}`} />
                      </span>
                      <span className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] transition-colors ${
                        selectedTag === tag.id
                          ? "bg-background/20 text-accent-foreground"
                          : "bg-muted text-muted-foreground group-hover:bg-background group-hover:text-foreground"
                      }`}>
                        {tag.count}
                      </span>
                    </div>
                  </button>
                );
              })}
              {sidebarLoading && (
                <div className="px-2 py-2 text-xs text-muted-foreground">Loading tags...</div>
              )}
              {!sidebarLoading && sidebarHasMore && (
                <div className="flex items-center gap-1 px-2 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                  <ChevronDown className="h-3 w-3 animate-bounce" />
                  Scroll to load more
                </div>
              )}
              {!sidebarLoading && !sidebarHasMore && sidebarTags.length === 0 && (
                <div className="px-2 py-2 text-xs text-muted-foreground italic">No tags found</div>
              )}
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="relative h-14 border-b border-border flex items-center px-4 gap-4 justify-between bg-background z-40">
           <div className="flex items-center gap-2 flex-1 max-w-md relative">
             <Search className="h-4 w-4 text-muted-foreground shrink-0" />
             <div className="flex items-center gap-1.5 flex-1 min-w-0">
                {selectedTag && (
                  <div className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap">
                    #{tagIndex[selectedTag]?.name || "tag"}
                    <button onClick={() => setSelectedTag("")} className="hover:text-primary/70">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                )}
               <Input 
                 placeholder={selectedTag ? "Search in tag..." : "Search... (type / for tags)"} 
                 className="border-none shadow-none focus-visible:ring-0 px-0 h-9 flex-1 min-w-[50px]"
                 value={search}
                 onChange={(e) => {
                   setSearch(e.target.value);
                   if (e.target.value.startsWith("/")) {
                     setShowTagSelector(true);
                   } else {
                     setShowTagSelector(false);
                   }
                 }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setShowTagSelector(false);
                    } else if (e.key === "Backspace" || e.key === "Delete") {
                      if (search === "" && selectedTag) {
                        e.preventDefault();
                        setSelectedTag("");
                      }
                    } else if (showTagSelector) {
                     if (e.key === "ArrowDown") {
                       e.preventDefault();
                       setActiveTagIndex(prev => (prev + 1) % (filteredTags.length || 1));
                     } else if (e.key === "ArrowUp") {
                       e.preventDefault();
                       setActiveTagIndex(prev => (prev - 1 + (filteredTags.length || 1)) % (filteredTags.length || 1));
                     } else if (e.key === "Enter") {
                       if (filteredTags.length > 0) {
                         e.preventDefault();
                         const tag = filteredTags[activeTagIndex];
                          if (tag) {
                            setSelectedTag(tag.id);
                            setShowStarred(false);
                            setShowShared(false);
                            setSearch("");
                            setShowTagSelector(false);
                          }
                       }
                     }
                   }
                 }}
               />
             </div>
             {search && !showTagSelector && (
               <button onClick={() => setSearch("")} className="shrink-0">
                 <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
               </button>
             )}

             {showTagSelector && (
               <div 
                 ref={tagSelectorRef}
                 className="absolute top-full left-0 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-200"
               >
                 <div className="p-1">
                   {filteredTags.map((tag, index) => (
                       <button
                         key={tag.id}
                          onClick={() => {
                            setSelectedTag(tag.id);
                            setShowStarred(false);
                            setShowShared(false);
                            setSearch("");
                            setShowTagSelector(false);
                          }}
                         className={`flex w-full items-center px-3 py-2 text-sm rounded-md text-left transition-colors ${
                           index === activeTagIndex 
                             ? "bg-accent text-accent-foreground" 
                             : "hover:bg-accent/50 hover:text-accent-foreground"
                         }`}
                       >
                         <span className="font-mono text-muted-foreground mr-2">#</span>
                         {tag.name}
                       </button>
                     ))}
                    {search.slice(1).trim() !== "" && filteredTags.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground italic">No tags found</div>
                    )}
                  </div>
                </div>
              )}
           </div>
            <div className="flex items-center gap-3 relative" ref={menuRef}>
              <Button onClick={handleCreate} size="sm" className="rounded-xl bg-[#6366f1] hover:bg-[#4f46e5] text-white border-none font-bold tracking-wide">
                + NEW
              </Button>
              <button 
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="w-8 h-8 rounded-full overflow-hidden border border-border hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                title={userEmail || "User menu"}
              >
                {avatarUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="User" className="w-full h-full object-cover" style={{ imageRendering: "pixelated" }} />
                )}
              </button>
              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 rounded-md border border-border bg-popover p-1 shadow-md z-[100] animate-in fade-in zoom-in-95 duration-200">
                  <div className="px-2 py-1.5 text-xs text-muted-foreground truncate border-b border-border/50 mb-1">
                    {userEmail || "Signed in"}
                  </div>
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      router.push("/settings?return=/docs");
                    }}
                    className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Account Settings</span>
                  </button>
                  <div
                    className="relative"
                    onMouseEnter={() => setShowImportMenu(true)}
                    onMouseLeave={() => setShowImportMenu(false)}
                  >
                    <button
                      onClick={() => setShowImportMenu((prev) => !prev)}
                      className="relative flex w-full cursor-default select-none items-center justify-between rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                    >
                      <span className="flex items-center">
                        <Upload className="mr-2 h-4 w-4" />
                        Import
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 opacity-70" />
                    </button>
                    {showImportMenu && (
                      <div className="absolute right-full top-0 mr-1 w-44 rounded-md border border-border bg-popover p-1 shadow-md">
                          <button
                            onClick={() => {
                              setShowUserMenu(false);
                              setShowImportMenu(false);
                              openImportModal("hedgedoc");
                            }}
                            className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                          >
                            <FileArchive className="mr-2 h-4 w-4" />
                            HedgeDoc
                          </button>
                          <button
                            onClick={() => {
                              setShowUserMenu(false);
                              setShowImportMenu(false);
                              openImportModal("notes");
                            }}
                            className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                          >
                            <FileArchive className="mr-2 h-4 w-4" />
                            MicroNote
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={openExportModal}
                      className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      <span>Export</span>
                    </button>
                    <button
                      onClick={handleLogout}
                      className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                    >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {loading ? (
             <div className="flex justify-center py-20 text-muted-foreground animate-pulse">Loading...</div>
          ) : docs.length === 0 ? (
             <div className="text-center py-20 text-muted-foreground">
               {showShared ? "No shared notes found." : "No micro notes found."}
             </div>
           ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {docs.map((doc, index) => {
                  const docTags = (doc.tag_ids || []).map((id) => tagIndex[id]).filter(Boolean) as Tag[];
                  const isEditing = editingDocId === doc.id;
                  const previewContent = showShared ? (doc.summary || "") : doc.content;
                
                return (
                  <div
                    key={doc.id || `${doc.title}-${doc.mtime}-${index}`}
                    onClick={() => router.push(`/docs/${doc.id}`)}
                    className={`group relative flex flex-col border border-border bg-card p-4 h-56 hover:border-foreground transition-colors cursor-pointer rounded-[8px] ${isEditing ? "overflow-visible" : "overflow-hidden"}`}
                  >
                    {isEditing && (
        <TagEditor
          doc={doc}
          allTags={tags}
          onSave={handleUpdateTags}
          onClose={() => setEditingDocId(null)}
        />
                    )}

                      {!isEditing && (
                        <div className="absolute top-2 right-2 flex gap-1 z-20">
                          {showShared ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (doc.share_token) {
                                  handleCopyShare(doc.share_token);
                                }
                              }}
                              className="p-1.5 rounded-full transition-all text-muted-foreground opacity-100 bg-background/80 shadow-sm hover:text-foreground"
                              title="Copy share link"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={(e) => handleStarToggle(e, doc)}
                                className={`p-1.5 rounded-full transition-all ${
                                  doc.starred 
                                    ? "text-yellow-500 opacity-100 bg-background/80 shadow-sm" 
                                    : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-background/80 hover:text-foreground"
                                }`}
                              >
                                <Star className={`h-3.5 w-3.5 ${doc.starred ? "fill-current" : ""}`} />
                              </button>
                              <button
                                onClick={(e) => handlePinToggle(e, doc)}
                                className={`p-1.5 rounded-full transition-all ${
                                  doc.pinned 
                                    ? "text-foreground opacity-100 bg-background/80 shadow-sm" 
                                    : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-background/80 hover:text-foreground"
                                }`}
                              >
                                <Pin className={`h-3.5 w-3.5 ${doc.pinned ? "fill-current" : ""}`} />
                              </button>
                            </>
                          )}
                        </div>
                      )}

                    <h3 className="font-mono font-bold text-lg mb-2 truncate px-2 text-center">{doc.title}</h3>
                    
                    <div className="relative flex-1 min-h-0 mb-2 overflow-hidden">
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap font-sans pb-8 break-words">
                        {previewContent || <span className="italic opacity-50">Empty</span>}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-card to-transparent pointer-events-none" />
                    </div>

                    <div className="mt-auto flex flex-col gap-1 border-t border-border/50 pt-2 z-10">
                      <div className="text-[10px] text-muted-foreground font-mono text-center mb-1">
                        Updated {formatRelativeTime(doc.mtime)}
                      </div>
                      <div className="relative group/tags flex items-center justify-center min-h-[1.5rem]">
                         <div className="flex flex-wrap gap-1 max-h-12 overflow-hidden justify-center items-center px-4 transition-all">
                            {docTags.length > 0 ? (
                              docTags.map((tag) => (
                                <span
                                  key={tag.id}
                                  className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-secondary text-secondary-foreground border border-border/50 whitespace-nowrap max-w-[80px] truncate"
                                  title={tag.name}
                                >
                                  #{tag.name}
                                </span>
                              ))
                            ) : (
                              <span className="text-[10px] text-muted-foreground/40 italic px-1">No tags</span>
                            )}
                         </div>
                         <button 
                            onClick={(e) => { e.stopPropagation(); setEditingDocId(doc.id); }}
                            className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-all hover:bg-muted rounded-full"
                            title="Edit tags"
                         >
                           <Pencil className="h-3 w-3" />
                         </button>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
              {loadingMore && (
                <div className="flex justify-center text-xs text-muted-foreground">Loading more...</div>
              )}
              {hasMore && <div ref={loadMoreRef} className="h-6" />}
            </div>
          )}
        </div>
      </main>

      {importOpen && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={importStep === "importing" ? undefined : closeImportModal}
          />
          <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <div className="text-sm font-bold">
                  {importSource === "hedgedoc" ? "Import from HedgeDoc" : "Import Notes (JSON)"}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {importSource === "hedgedoc"
                    ? "Upload a HedgeDoc export ZIP to import notes"
                    : "Upload a notes JSON ZIP to import notes"}
                </div>
              </div>
              <button
                className="text-muted-foreground hover:text-foreground"
                onClick={closeImportModal}
                disabled={importStep === "importing"}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {importError && (
                <div className="bg-destructive/10 text-destructive text-sm px-3 py-2 rounded-lg">
                  {importError}
                </div>
              )}

              {importStep === "upload" && (
                <div className="space-y-4">
                  <div className="border border-dashed border-border rounded-2xl p-6 text-center bg-muted/20">
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary mx-auto mb-3">
                      <FileArchive className="h-5 w-5" />
                    </div>
                    <div className="text-sm font-medium">
                      {importSource === "hedgedoc" ? "Upload HedgeDoc ZIP" : "Upload Notes JSON ZIP"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Only .zip files are supported</div>
                    <label className="inline-flex items-center gap-2 mt-4 cursor-pointer rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold hover:bg-accent">
                      <Upload className="h-4 w-4" />
                      Choose file
                      <input
                        type="file"
                        accept=".zip"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) handleImportFile(file);
                        }}
                      />
                    </label>
                    {importFileName && (
                      <div className="text-xs text-muted-foreground mt-2">{importFileName}</div>
                    )}
                  </div>
                  {importSource === "hedgedoc" ? (
                    <div className="text-[11px] text-muted-foreground">
                      We will extract tags from lines starting with <code className="font-mono">###### tags:</code> and remove them from the content.
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted-foreground">
                      Each JSON file should include title and content, with optional summary and tag_list.
                    </div>
                  )}
                </div>
              )}

              {importStep === "parsing" && (
                <div className="flex flex-col items-center justify-center py-12 text-sm text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full border border-border bg-background flex items-center justify-center">
                      <ChevronDown className="h-4 w-4 animate-bounce" />
                    </div>
                    <span>Parsing archive and extracting notes...</span>
                  </div>
                </div>
              )}

              {importStep === "preview" && importPreview && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl border border-border bg-muted/20 p-3">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Notes</div>
                      <div className="text-lg font-bold mt-1">{importPreview.notes_count}</div>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/20 p-3">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Tags</div>
                      <div className="text-lg font-bold mt-1">{importPreview.tags_count}</div>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/20 p-3">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Conflicts</div>
                      <div className="text-lg font-bold mt-1">{importPreview.conflicts}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Conflict handling</div>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { label: "Ignore", value: "skip", hint: "Skip existing titles" },
                          { label: "Overwrite", value: "overwrite", hint: "Replace existing notes" },
                          { label: "Add Suffix", value: "append", hint: "Create with suffix" },
                        ] as { label: string; value: ImportMode; hint: string }[]
                      ).map((item) => (
                        <button
                          key={item.value}
                          onClick={() => setImportMode(item.value)}
                          className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                            importMode === item.value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:bg-accent"
                          }`}
                        >
                          <div>{item.label}</div>
                          <div className="text-[10px] text-muted-foreground mt-1">{item.hint}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {importPreview.samples.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Sample notes</div>
                      <div className="space-y-2">
                        {importPreview.samples.map((item) => (
                          <div key={item.title} className="border border-border rounded-xl p-3 bg-background">
                            <div className="text-sm font-semibold truncate">{item.title}</div>
                            {item.tags.length > 0 && (
                              <div className="text-[11px] text-muted-foreground mt-1">#{item.tags.join(" #")}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {importStep === "importing" && (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground">Importing notes, please wait...</div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500"
                      style={{ width: `${importProgress}%` }}
                    />
                  </div>
                  <div className="text-xs text-muted-foreground">{Math.round(importProgress)}%</div>
                </div>
              )}

              {importStep === "done" && importReport && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border bg-muted/20 p-3">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Success</div>
                      <div className="text-lg font-bold mt-1">{importReport.created + importReport.updated + importReport.skipped}</div>
                    </div>
                    <div className="rounded-xl border border-border bg-muted/20 p-3">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Failed</div>
                      <div className="text-lg font-bold mt-1">{importReport.failed}</div>
                    </div>
                  </div>
                  {(importReport.failed_titles || []).length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Failed notes</div>
                      <div className="max-h-40 overflow-y-auto border border-border rounded-xl p-3 text-xs text-muted-foreground">
                        {(importReport.failed_titles || []).map((title) => (
                          <div key={title} className="truncate">{title}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
              <Button variant="outline" onClick={closeImportModal} disabled={importStep === "importing"}>
                {importStep === "done" ? "Close" : "Cancel"}
              </Button>
              {importStep === "preview" && (
                <Button onClick={handleImportConfirm}>Continue</Button>
              )}
            </div>
          </div>
        </div>
      )}

      {exportOpen && (
        <div className="fixed inset-0 z-[180] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={closeExportModal} />
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <div className="text-sm font-bold">Export Notes</div>
                <div className="text-[11px] text-muted-foreground">Export all notes as JSON zip</div>
              </div>
              <button className="text-muted-foreground hover:text-foreground" onClick={closeExportModal}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="text-sm text-muted-foreground">
                This will export all your notes into a ZIP file containing JSON documents.
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={closeExportModal}>Cancel</Button>
                <Button onClick={() => {
                  closeExportModal();
                  handleExportNotes();
                }}>Export</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
