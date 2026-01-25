"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tag, Document } from "@/types";
import { ChevronLeft, Trash2, Search, Tag as TagIcon } from "lucide-react";

interface TagWithUsage extends Tag {
  usageCount: number;
}

export default function TagsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tags, setTags] = useState<TagWithUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const returnTo = searchParams.get("return");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch all tags
      const tagsData = await apiFetch<Tag[]>("/tags") || [];
      
      // 2. Fetch all documents to calculate usage
      const docsData = await apiFetch<Document[]>("/documents") || [];
      
      // 3. Fetch details for all documents to get tag_ids (N+1 but required)
      const docsWithTags = await Promise.all(docsData.map(async (doc) => {
        try {
          const detail = await apiFetch<{ tag_ids: string[] }>(`/documents/${doc.id}`);
          return { ...doc, tag_ids: detail.tag_ids || [] };
        } catch {
          return { ...doc, tag_ids: [] };
        }
      }));

      // 4. Calculate usage counts
      const counts: Record<string, number> = {};
      docsWithTags.forEach(doc => {
        doc.tag_ids?.forEach((id: string) => {
          counts[id] = (counts[id] || 0) + 1;
        });
      });

      // 5. Merge usage into tags
      const tagsWithUsage = tagsData.map(tag => ({
        ...tag,
        usageCount: counts[tag.id] || 0
      })).sort((a, b) => b.usageCount - a.usageCount || a.name.localeCompare(b.name));

      setTags(tagsWithUsage);
    } catch (e) {
      console.error(e);
      alert("Failed to load tags data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleBack = useCallback(() => {
    if (returnTo) {
      router.push(returnTo);
      return;
    }
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/docs");
  }, [returnTo, router]);

  const handleDelete = async (tag: TagWithUsage) => {
    if (tag.usageCount > 0) return;
    
    if (!confirm(`Are you sure you want to delete tag #${tag.name}?`)) return;

    setDeletingId(tag.id);
    try {
      await apiFetch(`/tags/${tag.id}`, { method: "DELETE" });
      setTags(prev => prev.filter(t => t.id !== tag.id));
    } catch (e) {
      console.error(e);
      alert("Failed to delete tag");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredTags = tags.filter(tag => 
    tag.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="h-14 border-b border-border flex items-center px-4 gap-4 bg-background z-20">
        <Button variant="ghost" size="icon" onClick={handleBack}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="font-bold font-mono text-lg">Manage Tags</div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 max-w-4xl mx-auto w-full">
        <div className="mb-6 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search tags..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="flex flex-col gap-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-muted/50 rounded animate-pulse" />
            ))}
          </div>
        ) : filteredTags.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            {search ? "No tags match your search." : "No tags found."}
          </div>
        ) : (
          <div className="grid gap-2">
            {filteredTags.map(tag => (
              <div 
                key={tag.id}
                className="flex items-center justify-between p-3 border border-border rounded-lg bg-card hover:border-foreground/50 transition-colors"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <TagIcon className="h-4 w-4 text-secondary-foreground" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-mono font-bold truncate text-sm">#{tag.name}</span>
                    <span className="text-xs text-muted-foreground">
                      Used in {tag.usageCount} note{tag.usageCount !== 1 && 's'}
                    </span>
                  </div>
                </div>

                <Button 
                  variant={tag.usageCount > 0 ? "ghost" : "destructive"} 
                  size="sm" 
                  disabled={tag.usageCount > 0 || deletingId === tag.id}
                  onClick={() => handleDelete(tag)}
                  className={tag.usageCount > 0 ? "text-muted-foreground opacity-50 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground rounded-xl" : "rounded-xl"}
                  title={tag.usageCount > 0 ? "Cannot delete tag in use" : "Delete tag"}
                >
                  {deletingId === tag.id ? (
                    <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  <span className="ml-2 hidden sm:inline">
                    {tag.usageCount > 0 ? "In Use" : "Delete"}
                  </span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
