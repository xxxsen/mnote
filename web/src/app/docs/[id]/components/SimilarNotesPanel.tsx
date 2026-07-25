import { Sparkles, ChevronRight, RefreshCw, X } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import type { SimilarDoc } from "../types";
import type { SimilarIndexStatus } from "../hooks/useSimilarDocs";

type SimilarNotesPanelProps = {
  similarIconVisible: boolean;
  similarCollapsed: boolean;
  similarLoading: boolean;
  similarIndexStatus: SimilarIndexStatus;
  similarDocs: SimilarDoc[];
  onToggle: () => void;
  onCollapse: () => void;
  onClose: () => void;
  onOpenPreview: (id: string) => void;
  onNavigate: (id: string) => void;
};

export function SimilarNotesPanel(props: SimilarNotesPanelProps) {
  const { similarIconVisible, similarCollapsed, similarLoading, similarIndexStatus, similarDocs, onToggle, onCollapse, onClose, onOpenPreview, onNavigate } = props;

  if (!similarIconVisible) return null;

  return (
    <aside
      aria-label="Similar notes"
      className={`fixed bottom-[calc(3rem+env(safe-area-inset-bottom))] right-4 z-[100] flex flex-col overflow-hidden rounded-xl border border-border bg-background/95 shadow-lg backdrop-blur-md transition-all duration-200 motion-reduce:transition-none md:right-6 ${
        similarCollapsed ? "h-10 w-10" : "max-h-[400px] w-72 max-w-[calc(100vw-2rem)]"
      }`}
    >
      {similarCollapsed ? (
        <button
          type="button"
          onClick={onToggle}
          className="relative flex h-full w-full items-center justify-center text-primary transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          aria-label={`Show similar notes${similarDocs.length > 0 ? `, ${similarDocs.length} found` : ""}`}
          title="Show similar notes"
        >
          <Sparkles className={`h-5 w-5 ${similarLoading ? "animate-pulse motion-reduce:animate-none" : ""}`} aria-hidden="true" />
          {similarDocs.length > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background bg-primary text-xs font-semibold text-primary-foreground">
              {similarDocs.length}
            </span>
          ) : null}
        </button>
      ) : (
        <>
          <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-2">
            <div className="flex items-center gap-2">
              <Sparkles className={`h-4 w-4 text-primary ${similarLoading ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
              <span className="text-sm font-semibold">Similar notes</span>
            </div>
            <div className="flex items-center gap-1">
              <IconButton type="button" label="Collapse similar notes" variant="ghost" className="h-8 w-8" onClick={onCollapse}>
                <ChevronRight className="h-4 w-4 rotate-90" aria-hidden="true" />
              </IconButton>
              <IconButton type="button" label="Close similar notes" variant="ghost" className="h-8 w-8" onClick={onClose}>
                <X className="h-4 w-4" aria-hidden="true" />
              </IconButton>
            </div>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {similarLoading && similarDocs.length === 0 ? (
              <div role="status" className="flex flex-col items-center justify-center gap-3 py-10 text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                <span className="text-sm">Finding similar notes…</span>
              </div>
            ) : similarIndexStatus === "disabled" ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Semantic indexing is disabled.</div>
            ) : similarIndexStatus === "building" ? (
              <div className="py-10 text-center text-sm text-muted-foreground">The semantic index is being built.</div>
            ) : similarIndexStatus === "pending" ? (
              <div className="py-10 text-center text-sm text-muted-foreground">This note is waiting to be indexed.</div>
            ) : similarIndexStatus === "unavailable" ? (
              <div className="py-10 text-center text-sm text-muted-foreground">Similar notes are temporarily unavailable.</div>
            ) : similarDocs.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No similar notes found.</div>
            ) : similarDocs.map((doc) => (
              <div key={doc.id} className="grid grid-cols-[minmax(0,1fr)_2rem] items-start gap-1 rounded-xl border border-border bg-background">
                <button
                  type="button"
                  onClick={() => onOpenPreview(doc.id)}
                  className="min-w-0 rounded-l-xl p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  aria-label={`Preview ${doc.title || "Untitled"}`}
                >
                  <span className="block text-xs text-muted-foreground">
                    Relevance {Math.round(Math.max(-1, Math.min(1, doc.score || 0)) * 100)}
                  </span>
                  <span className="mt-1 block line-clamp-2 text-sm font-semibold leading-snug">
                    {doc.title || "Untitled"}
                  </span>
                </button>
                <IconButton
                  type="button"
                  label={`Open ${doc.title || "Untitled"}`}
                  variant="ghost"
                  className="mt-2 h-8 w-8"
                  onClick={() => onNavigate(doc.id)}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </IconButton>
              </div>
            ))}
          </div>
          <div className="border-t border-border bg-muted/10 px-3 py-2">
            <p className="text-center text-xs text-muted-foreground">Based on indexed document content</p>
          </div>
        </>
      )}
    </aside>
  );
}
