"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Document, DocumentVersion } from "@/types";
import { computeDiff, DiffRow } from "@/lib/diff";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Check, AlertTriangle, ChevronUp, ChevronDown } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default function RevertPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const id = params.id as string;
  const versionId = searchParams.get("versionId");

  const [doc, setDoc] = useState<Document | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<DocumentVersion | null>(null);
  const [diffRows, setDiffRows] = useState<DiffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentDiffIndex, setCurrentDiffIndex] = useState(-1);

  const diffIndices = useMemo(() => {
    const indices: number[] = [];
    let inDiffBlock = false;
    diffRows.forEach((row, i) => {
      const isChange = (row.left?.type === 'removed') || (row.right?.type === 'added');
      if (isChange && !inDiffBlock) {
        indices.push(i);
        inDiffBlock = true;
      } else if (!isChange) {
        inDiffBlock = false;
      }
    });
    return indices;
  }, [diffRows]);

  const scrollToDiff = useCallback((index: number) => {
    if (index < 0 || index >= diffIndices.length) return;
    
    const rowIdx = diffIndices[index];
    const el = document.querySelector(`[data-diff-index="${rowIdx}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setCurrentDiffIndex(index);
    }
  }, [diffIndices]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [docRes, versionsRes] = await Promise.all([
          apiFetch<{ document: Document }>(`/documents/${id}`),
          apiFetch<DocumentVersion[]>(`/documents/${id}/versions`)
        ]);

        const currentDoc = docRes.document;
        const version = versionsRes.find(v => v.id === versionId);

        if (!currentDoc || !version) {
          router.push(`/docs/${id}`);
          return;
        }

        setDoc(currentDoc);
        setSelectedVersion(version);
        setDiffRows(computeDiff(currentDoc.content, version.content));
      } catch (e) {
        console.error(e);
        router.push(`/docs/${id}`);
      } finally {
        setLoading(false);
      }
    };

    if (id && versionId) {
      loadData();
    }
  }, [id, versionId, router]);

  useEffect(() => {
    if (diffIndices.length === 0) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (currentDiffIndex > 0) {
          scrollToDiff(currentDiffIndex - 1);
        }
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        const nextIndex = currentDiffIndex < 0 ? 0 : currentDiffIndex + 1;
        if (nextIndex < diffIndices.length) {
          scrollToDiff(nextIndex);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [diffIndices, currentDiffIndex, scrollToDiff]);

  const handleConfirm = async () => {
    if (!selectedVersion || !doc) return;
    
    setSaving(true);
    try {
      await apiFetch(`/documents/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          title: selectedVersion.title,
          content: selectedVersion.content
        }),
      });
      router.push(`/docs/${id}`);
    } catch (err) {
      console.error(err);
      alert("Failed to revert document");
      setSaving(false);
    }
  };

  if (loading || !doc || !selectedVersion) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">
        Loading comparison...
      </div>
    );
  }

  const titleChanged = doc.title !== selectedVersion.title;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="h-16 border-b border-border flex items-center px-6 justify-between bg-card z-10 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/docs/${id}`)}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-bold text-lg leading-none mb-1">Revert Document</h1>
            <p className="text-xs text-muted-foreground font-mono">
              Comparing Current vs v{selectedVersion.version} ({formatDate(selectedVersion.ctime)})
            </p>
          </div>
          
          {diffIndices.length > 0 && (
            <div className="flex items-center ml-4 border border-border/60 rounded-md bg-muted/30 shadow-sm overflow-hidden">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-none hover:bg-background" 
                disabled={currentDiffIndex <= 0}
                onClick={() => scrollToDiff(currentDiffIndex - 1)}
                title="Previous Change"
              >
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              </Button>
              <div className="h-4 w-[1px] bg-border/60" />
              <span className="text-[10px] font-mono font-medium px-3 text-muted-foreground min-w-[60px] text-center select-none">
                {currentDiffIndex >= 0 ? currentDiffIndex + 1 : 0} / {diffIndices.length}
              </span>
              <div className="h-4 w-[1px] bg-border/60" />
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-none hover:bg-background" 
                disabled={currentDiffIndex >= diffIndices.length - 1}
                onClick={() => {
                   const nextIndex = currentDiffIndex < 0 ? 0 : currentDiffIndex + 1;
                   scrollToDiff(nextIndex);
                }}
                title="Next Change"
              >
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => router.push(`/docs/${id}`)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={saving} variant="destructive">
            {saving ? "Restoring..." : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Confirm Revert
              </>
            )}
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6 bg-muted/20">
        <div className="max-w-7xl mx-auto space-y-6">
          
          {titleChanged && (
            <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <AlertTriangle className="h-3 w-3" /> Title Change
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Current</div>
                  <div className="p-2 bg-red-500/10 text-red-700 dark:text-red-400 rounded border border-red-500/20 font-medium">
                    {doc.title}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Revert To</div>
                  <div className="p-2 bg-green-500/10 text-green-700 dark:text-green-400 rounded border border-green-500/20 font-medium">
                    {selectedVersion.title}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-card border border-border rounded-lg shadow-sm overflow-hidden flex flex-col h-[calc(100vh-12rem)]">
            <div className="flex border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground sticky top-0 z-10">
              <div className="flex-1 p-2 pl-4 border-r border-border">Current Document</div>
              <div className="flex-1 p-2 pl-4">Selected Version (v{selectedVersion.version})</div>
            </div>
            
            <div className="flex-1 overflow-auto font-mono text-sm leading-6">
              <div className="min-w-fit">
                {diffRows.map((row, idx) => (
                  <div 
                    key={idx} 
                    data-diff-index={idx}
                    className="flex border-b border-border/50 hover:bg-muted/30 group"
                  >
                    <div className={`flex-1 p-0 pl-1 border-r border-border min-w-0 ${
                      row.left?.type === 'removed' ? 'bg-red-500/10 dark:bg-red-900/20' : ''
                    }`}>
                      {row.left ? (
                        <div className="px-3 whitespace-pre-wrap break-all py-0.5 relative">
                           {row.left.type === 'removed' && (
                             <span className="absolute left-0 top-0 bottom-0 w-1 bg-red-500/50" />
                           )}
                           {row.left.value || <br />}
                        </div>
                      ) : (
                         <div className="bg-muted/20 h-full w-full opacity-50" />
                      )}
                    </div>
                    
                    <div className={`flex-1 p-0 pl-1 min-w-0 ${
                      row.right?.type === 'added' ? 'bg-green-500/10 dark:bg-green-900/20' : ''
                    }`}>
                      {row.right ? (
                        <div className="px-3 whitespace-pre-wrap break-all py-0.5 relative">
                           {row.right.type === 'added' && (
                             <span className="absolute left-0 top-0 bottom-0 w-1 bg-green-500/50" />
                           )}
                           {row.right.value || <br />}
                        </div>
                      ) : (
                         <div className="bg-muted/20 h-full w-full opacity-50" />
                      )}
                    </div>
                  </div>
                ))}
                
                {diffRows.length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">
                    No content differences found.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
