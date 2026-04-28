import { Sparkles, ChevronRight, RefreshCw, X } from "lucide-react";
import type { SimilarDoc } from "../types";

type SimilarNotesPanelProps = {
  similarIconVisible: boolean;
  similarCollapsed: boolean;
  similarLoading: boolean;
  similarDocs: SimilarDoc[];
  onToggle: () => void;
  onCollapse: () => void;
  onClose: () => void;
  onOpenPreview: (id: string) => void;
  onNavigate: (id: string) => void;
};

export function SimilarNotesPanel(props: SimilarNotesPanelProps) {
  const { similarIconVisible, similarCollapsed, similarLoading, similarDocs, onToggle, onCollapse, onClose, onOpenPreview, onNavigate } = props;

  if (!similarIconVisible) return null;

  return (
    <div className={`fixed bottom-12 right-6 z-[100] transition-all duration-300 ${similarCollapsed ? "w-10 h-10" : "w-72 max-h-[400px]"} flex flex-col bg-background/80 backdrop-blur-md border border-border shadow-2xl rounded-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4`}>
      {similarCollapsed ? (
        <button onClick={onToggle} className="w-full h-full flex items-center justify-center text-primary hover:bg-muted/50 transition-colors relative" title="Find similar notes">
          <Sparkles className={`h-5 w-5 ${similarLoading ? "animate-pulse" : ""}`} />
          {similarDocs.length > 0 && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[8px] font-bold rounded-full flex items-center justify-center border-2 border-background">{similarDocs.length}</div>
          )}
        </button>
      ) : (
        <>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
            <div className="flex items-center gap-2">
              <Sparkles className={`h-3.5 w-3.5 text-primary ${similarLoading ? "animate-spin" : ""}`} />
              <span className="text-xs font-bold uppercase tracking-wider">Similar Notes</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={onCollapse} className="p-1 text-muted-foreground hover:text-foreground transition-colors" title="Collapse"><ChevronRight className="h-3.5 w-3.5 rotate-90" /></button>
              <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors" title="Close"><X className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
            {similarLoading && similarDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground"><RefreshCw className="h-5 w-5 animate-spin opacity-50" /><span className="text-[10px] font-mono uppercase tracking-widest">Searching...</span></div>
            ) : similarDocs.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">No similar notes found.</div>
            ) : similarDocs.map((doc) => (
              <div key={doc.id} onClick={() => onOpenPreview(doc.id)} className="p-3 border border-border rounded-xl cursor-pointer hover:border-primary transition-all bg-background/50 hover:bg-background group">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-tighter">{Math.round((doc.score || 0) * 100)}% Match</span>
                  <div className="flex items-center gap-1">
                    <button onClick={(e) => { e.stopPropagation(); onNavigate(doc.id); }} className="p-1 hover:bg-muted rounded-md transition-colors" title="Open full page"><ChevronRight className="h-3 w-3 text-muted-foreground" /></button>
                  </div>
                </div>
                <div className="font-bold text-xs leading-snug line-clamp-2 group-hover:text-primary transition-colors">{doc.title || "Untitled"}</div>
              </div>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-border bg-muted/10"><p className="text-[9px] text-muted-foreground text-center italic">Based on your current title</p></div>
        </>
      )}
    </div>
  );
}
