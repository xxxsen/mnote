"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ChevronLeft, Trash2, Search, Tag as TagIcon } from "lucide-react";

const loadingPlaceholders = ["p0", "p1", "p2", "p3", "p4"];

interface TagWithUsage {
  id: string;
  name: string;
  usageCount: number;
}

export default function TagsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [tags, setTags] = useState<TagWithUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const fetchingRef = useRef(false);
  const [search, setSearch] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TagWithUsage | null>(null);
  const returnTo = getSafeReturn(searchParams.get("return"));

  const fetchData = useCallback(async (nextOffset: number, append: boolean) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const params = new URLSearchParams();
      params.set("limit", "10");
      params.set("offset", String(nextOffset));
      if (search.trim()) {
        params.set("q", search.trim());
      }
      const items = await apiFetch<{ id: string; name: string; count: number }[]>(`/tags/summary?${params.toString()}`) || [];
      const next: TagWithUsage[] = items.map((tag) => ({
        id: tag.id,
        name: tag.name,
        usageCount: tag.count,
      }));
      setTags((prev) => (append ? [...prev, ...next] : next));
      setHasMore(items.length === 10);
      setOffset(nextOffset + items.length);
    } catch (e) {
      console.error(e);
      toast({ description: e instanceof Error ? e : "Failed to load tags data", variant: "error" });
    } finally {
      fetchingRef.current = false;
      setLoading(false);
      setLoadingMore(false);
    }
  }, [search, toast]);

  useEffect(() => {
    setOffset(0);
    setHasMore(true);
    fetchData(0, false);
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

  const confirmDelete = async (tag: TagWithUsage) => {
    setDeletingId(tag.id);
    try {
      await apiFetch(`/tags/${tag.id}`, { method: "DELETE" });
      setTags(prev => prev.filter(t => t.id !== tag.id));
    } catch (e) {
      console.error(e);
      toast({ description: e instanceof Error ? e : "Failed to delete tag", variant: "error" });
    } finally {
      setDeletingId(null);
    }
  };

  const filteredTags = tags;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="h-14 border-b border-border flex items-center px-4 gap-4 bg-background z-20">
        <Button variant="ghost" size="icon" onClick={handleBack}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="font-bold font-mono text-lg">Tag Management</div>
      </header>

      <div
        className="flex-1 overflow-y-auto p-4 md:p-8 max-w-4xl mx-auto w-full"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (loading || loadingMore || !hasMore) return;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 120) {
            fetchData(offset, true);
          }
        }}
      >
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
            {loadingPlaceholders.map((key) => (
              <div key={key} className="h-12 bg-muted/50 rounded animate-pulse" />
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
                  variant="destructive" 
                  size="sm" 
                  disabled={deletingId === tag.id}
                  onClick={() => setDeleteTarget(tag)}
                  className="rounded-xl"
                  title="Delete tag"
                >
                  {deletingId === tag.id ? (
                    <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  <span className="ml-2 hidden sm:inline">
                    Delete
                  </span>
                </Button>
              </div>
            ))}
          </div>
        )}
        {loadingMore && (
          <div className="mt-4 text-center text-xs text-muted-foreground">Loading more...</div>
        )}
      </div>
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-5 shadow-xl">
            <div className="text-sm font-semibold">Delete tag</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Delete <span className="font-mono font-semibold text-foreground">#{deleteTarget.name}</span>? It will be removed from {deleteTarget.usageCount} note{deleteTarget.usageCount === 1 ? "" : "s"}.
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  const tag = deleteTarget;
                  setDeleteTarget(null);
                  void confirmDelete(tag);
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getSafeReturn(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  return value;
}
