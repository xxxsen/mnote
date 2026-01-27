"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, removeAuthToken, getAuthToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Document, Tag } from "@/types";
import { Search, LogOut, X, Settings, Pin, Pencil } from "lucide-react";

function TagEditor({ doc, allTags, onSave, onClose }: { doc: DocumentWithTags, allTags: Tag[], onSave: (doc: DocumentWithTags, ids: string[]) => void, onClose: () => void }) {
  const [selected, setSelected] = useState<string[]>(doc.tag_ids || []);
  const toggle = (id: string) => {
    if (selected.includes(id)) {
      setSelected(selected.filter((tagId) => tagId !== id));
      return;
    }
    if (selected.length >= 7) {
      alert("You can only select up to 7 tags.");
      return;
    }
    setSelected([...selected, id]);
  };

  return (
    <div className="absolute inset-0 bg-card z-20 flex flex-col p-3 gap-2 animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted-foreground">Edit Tags</span>
        <button 
          onClick={(e) => { e.stopPropagation(); onClose(); }} 
          className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto content-start flex flex-wrap gap-1.5 p-1">
        {allTags.map(tag => {
           const active = selected.includes(tag.id);
           return (
             <button
               key={tag.id}
                onClick={(e) => { e.stopPropagation(); toggle(tag.id); }}
                className={`px-2 py-0.5 rounded-xl text-[10px] border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground"}`}
              >
                {tag.name}
              </button>
            );
        })}
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
}


const sortDocs = (docs: DocumentWithTags[]) => {
  return [...docs].sort((a, b) => {
    if ((b.pinned || 0) !== (a.pinned || 0)) {
      return (b.pinned || 0) - (a.pinned || 0);
    }
    return (b.ctime || 0) - (a.ctime || 0);
  });
};

export default function DocsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [docs, setDocs] = useState<DocumentWithTags[]>([]);
  const [recentDocs, setRecentDocs] = useState<DocumentWithTags[]>([]);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [totalDocs, setTotalDocs] = useState(0);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextOffset, setNextOffset] = useState(0);
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [selectedTag, setSelectedTag] = useState(searchParams.get("tag_id") || "");
  const [tagSearch, setTagSearch] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [activeTagIndex, setActiveTagIndex] = useState(0);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const fetchInFlightRef = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const tagSelectorRef = useRef<HTMLDivElement>(null);

  const filteredTags = tags.filter(t => t.name.toLowerCase().includes(search.slice(1).toLowerCase()));

  useEffect(() => {
    setActiveTagIndex(0);
  }, [search, showTagSelector]);

  useEffect(() => {
    const token = getAuthToken();
    if (token) {
       try {
         const payload = JSON.parse(atob(token.split('.')[1]));
         const email = payload.email || payload.sub || "user";
         setUserEmail(email);
         setAvatarUrl(generatePixelAvatar(email));
       } catch {
         setAvatarUrl(generatePixelAvatar("anon"));
       }
    } else {
        setAvatarUrl(generatePixelAvatar("anon"));
    }
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

  const fetchDocs = useCallback(async (offset: number, append: boolean) => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const query = new URLSearchParams();
      if (search) query.set("q", search);
      if (selectedTag) query.set("tag_id", selectedTag);
      query.set("limit", "20");
      query.set("offset", String(offset));

      const res = await apiFetch<Document[]>(`/documents?${query.toString()}`);
      
      const enrichedDocs = await Promise.all((res || []).map(async (doc) => {
        try {
          const detail = await apiFetch<{ tag_ids: string[] }>(`/documents/${doc.id}`);
          return { ...doc, tag_ids: detail.tag_ids };
        } catch {
          return { ...doc, tag_ids: [] };
        }
      }));
      setDocs((prev) => {
        if (append) {
          return sortDocs([...prev, ...enrichedDocs]);
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
  }, [search, selectedTag]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await apiFetch<{ recent: Document[]; tag_counts: Record<string, number>; total: number }>("/documents/summary?limit=5");
      setRecentDocs(sortDocs((res?.recent || []) as DocumentWithTags[]));
      setTagCounts(res?.tag_counts || {});
      setTotalDocs(res?.total || 0);
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      const res = await apiFetch<Tag[]>("/tags");
      setTags(res || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    fetchTags();
    fetchSummary();
  }, [fetchTags, fetchSummary]);

  useEffect(() => {
    setDocs([]);
    setHasMore(true);
    setNextOffset(0);
    setLoading(true);
    setLoadingMore(false);
    const timer = setTimeout(() => {
      fetchDocs(0, false);
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchDocs]);

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
      alert("Failed to create document");
    }
  };

  const handleUpdateTags = async (doc: DocumentWithTags, newTagIds: string[]) => {
    const updateDocs = (prevDocs: DocumentWithTags[]) => {
       return prevDocs.map(d => d.id === doc.id ? { ...d, tag_ids: newTagIds } : d);
    };
    setDocs(prev => updateDocs(prev));
    setEditingDocId(null);

    try {
      await apiFetch(`/documents/${doc.id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: doc.title,
          content: doc.content,
          tag_ids: newTagIds,
        })
      });
      void fetchSummary();
    } catch (err) {
      console.error("Failed to update tags", err);
    }
  };


  const handleLogout = () => {
    removeAuthToken();
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

  return (
    <div className="flex h-screen flex-col md:flex-row bg-background text-foreground">
      <aside className="w-full md:w-64 border-r border-border p-4 flex-col gap-4 hidden md:flex">
        <div className="font-mono font-bold text-xl tracking-tighter mb-4">
          Micro Note
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2 pr-2">
              <div className="text-xs font-bold uppercase text-muted-foreground">General</div>
            </div>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setSelectedTag("")}
                className={`group flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm font-medium transition-all ${
                  selectedTag === "" 
                    ? "bg-accent text-accent-foreground" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span>All Notes</span>
                <span className={`ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] transition-colors ${
                  selectedTag === ""
                    ? "bg-background/20 text-accent-foreground"
                    : "bg-muted text-muted-foreground group-hover:bg-background group-hover:text-foreground"
                }`}>
                  {totalDocs}
                </span>
              </button>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-2 pr-2">
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

          <div className="flex items-center justify-between mb-2 pr-2">
            <div className="text-xs font-bold uppercase text-muted-foreground">Tags</div>
            <button 
              onClick={() => router.push(`/tags?return=${encodeURIComponent("/docs")}`)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Manage Tags"
            >
              <Settings className="h-3 w-3" />
            </button>
          </div>
          <div className="mb-2 pr-2">
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
          <div className="flex flex-col gap-1">
            {tags
              .filter(tag => !tagSearch || tag.name.toLowerCase().includes(tagSearch.toLowerCase()))
              .map((tag) => (
              <button
                key={tag.id}
                onClick={() => setSelectedTag(tag.id)}
                className={`group flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm font-medium transition-all ${
                  selectedTag === tag.id
                    ? "bg-accent text-accent-foreground" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span className="truncate">#{tag.name}</span>
                <span className={`ml-2 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-[10px] transition-colors ${
                  selectedTag === tag.id
                    ? "bg-background/20 text-accent-foreground"
                    : "bg-muted text-muted-foreground group-hover:bg-background group-hover:text-foreground"
                }`}>
                  {tagCounts[tag.id] || 0}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="pt-4 border-t border-border">
           <Button variant="ghost" className="w-full justify-start pl-0" onClick={handleLogout}>
             <LogOut className="mr-2 h-4 w-4" />
             Logout
           </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center px-4 gap-4 justify-between bg-background z-10">
           <div className="flex items-center gap-2 flex-1 max-w-md relative">
             <Search className="h-4 w-4 text-muted-foreground shrink-0" />
             <div className="flex items-center gap-1.5 flex-1 min-w-0">
               {selectedTag && (
                 <div className="flex items-center gap-1 bg-primary/10 text-primary px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap">
                   #{tags.find(t => t.id === selectedTag)?.name || "tag"}
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
                   {filteredTags.length === 0 && (
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
                <div className="absolute right-0 top-full mt-2 w-48 rounded-md border border-border bg-popover p-1 shadow-md z-50 animate-in fade-in zoom-in-95 duration-200">
                  <div className="px-2 py-1.5 text-xs text-muted-foreground truncate border-b border-border/50 mb-1">
                    {userEmail || "Signed in"}
                  </div>
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
               No micro notes found.
             </div>
           ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {docs.map((doc, index) => {
                  const docTags = tags.filter((t) => doc.tag_ids?.includes(t.id));
                  const isEditing = editingDocId === doc.id;
                
                return (
                  <div
                    key={doc.id || `${doc.title}-${doc.mtime}-${index}`}
                    onClick={() => router.push(`/docs/${doc.id}`)}
                    className="group relative flex flex-col border border-border bg-card p-4 h-56 hover:border-foreground transition-colors cursor-pointer overflow-hidden rounded-[8px]"
                  >
                    {isEditing && (
                      <TagEditor doc={doc} allTags={tags} onSave={handleUpdateTags} onClose={() => setEditingDocId(null)} />
                    )}

                    {!isEditing && (
                      <button
                        onClick={(e) => handlePinToggle(e, doc)}
                        className={`absolute top-2 right-2 p-1.5 rounded-full transition-all z-20 ${
                          doc.pinned 
                            ? "text-foreground opacity-100 bg-background/80 shadow-sm" 
                            : "text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-background/80 hover:text-foreground"
                        }`}
                      >
                        <Pin className={`h-3.5 w-3.5 ${doc.pinned ? "fill-current" : ""}`} />
                      </button>
                    )}
                    <h3 className="font-mono font-bold text-lg mb-2 truncate px-2 text-center">{doc.title}</h3>
                    
                    <div className="relative flex-1 min-h-0 mb-2 overflow-hidden">
                      <div className="text-sm text-muted-foreground whitespace-pre-wrap font-sans pb-8 break-words">
                        {doc.content || <span className="italic opacity-50">Empty</span>}
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
    </div>
  );
}
