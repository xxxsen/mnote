"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, removeAuthToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";
import { Document, Tag } from "@/types";
import { Plus, Search, LogOut, X } from "lucide-react";

export default function DocsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [docs, setDocs] = useState<Document[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("q") || "");
  const [selectedTag, setSelectedTag] = useState(searchParams.get("tag_id") || "");

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search) query.set("q", search);
      if (selectedTag) query.set("tag_id", selectedTag);
      
      const res = await apiFetch<Document[]>(`/documents?${query.toString()}`);
      setDocs(res || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [search, selectedTag]);

  const fetchTags = async () => {
    try {
      const res = await apiFetch<Tag[]>("/tags");
      setTags(res || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDocs();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchDocs]);

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
    } catch (e) {
      alert("Failed to create document");
    }
  };

  const handleLogout = () => {
    removeAuthToken();
    router.push("/login");
  };

  return (
    <div className="flex h-screen flex-col md:flex-row bg-background text-foreground">
      <aside className="w-full md:w-64 border-r border-border p-4 flex-col gap-4 hidden md:flex">
        <div className="font-mono font-bold text-xl tracking-tighter mb-4">MNOTE</div>
        <div className="flex-1 overflow-y-auto">
          <div className="text-xs font-bold uppercase text-muted-foreground mb-2">Tags</div>
          <div className="flex flex-col gap-1">
            <button
              onClick={() => setSelectedTag("")}
              className={`text-left text-sm px-2 py-1 transition-colors ${
                selectedTag === "" ? "bg-accent text-accent-foreground font-medium" : "hover:bg-muted"
              }`}
            >
              All Notes
            </button>
            {tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => setSelectedTag(tag.id)}
                className={`text-left text-sm px-2 py-1 transition-colors ${
                  selectedTag === tag.id ? "bg-accent text-accent-foreground font-medium" : "hover:bg-muted"
                }`}
              >
                #{tag.name}
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
           <div className="flex items-center gap-2 flex-1 max-w-md">
             <Search className="h-4 w-4 text-muted-foreground" />
             <Input 
               placeholder="Search..." 
               className="border-none shadow-none focus-visible:ring-0 px-0 h-9"
               value={search}
               onChange={(e) => setSearch(e.target.value)}
             />
             {search && (
               <button onClick={() => setSearch("")}>
                 <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
               </button>
             )}
           </div>
           <Button onClick={handleCreate} size="sm">
             <Plus className="mr-2 h-4 w-4" />
             New Note
           </Button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          {loading ? (
             <div className="flex justify-center py-20 text-muted-foreground animate-pulse">Loading...</div>
          ) : docs.length === 0 ? (
             <div className="text-center py-20 text-muted-foreground">
               No documents found.
             </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {docs.map((doc, index) => (
                <div
                  key={doc.id || `${doc.title}-${doc.mtime}-${index}`}
                  onClick={() => router.push(`/docs/${doc.id}`)}
                  className="group relative flex flex-col border border-border bg-card p-4 h-48 hover:border-foreground transition-colors cursor-pointer overflow-hidden"
                >
                  <h3 className="font-mono font-bold text-lg mb-2 truncate pr-2">{doc.title}</h3>
                  <div className="text-sm text-muted-foreground line-clamp-4 flex-1 font-sans">
                    {doc.content || <span className="italic opacity-50">Empty</span>}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground font-mono pt-2 border-t border-border/50 flex justify-between">
                    <span>{formatDate(doc.mtime)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
