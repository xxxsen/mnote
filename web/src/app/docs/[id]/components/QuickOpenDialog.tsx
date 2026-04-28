import { Search, ChevronRight, X } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { Document } from "@/types";

type QuickOpenDialogProps = {
  show: boolean;
  query: string;
  index: number;
  loading: boolean;
  showSearchResults: boolean;
  docs: Document[];
  onQueryChange: (q: string) => void;
  onIndexChange: (i: number) => void;
  onSelect: (doc: Document) => void;
  onClose: () => void;
};

export function QuickOpenDialog(props: QuickOpenDialogProps) {
  const { show, query, index, loading, showSearchResults, docs, onQueryChange, onIndexChange, onSelect, onClose } = props;
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-start justify-center pt-[15vh] px-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-popover border border-border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="flex items-center px-4 py-3 border-b border-border gap-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            autoFocus
            placeholder="Quick open note..."
            className="bg-transparent border-none focus:ring-0 text-sm flex-1 outline-none"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") { onClose(); return; }
              if (docs.length === 0) return;
              if (e.key === "ArrowDown") { e.preventDefault(); onIndexChange((index + 1) % docs.length); }
              else if (e.key === "ArrowUp") { e.preventDefault(); onIndexChange((index - 1 + docs.length) % docs.length); }
              else if (e.key === "Enter") { e.preventDefault(); onSelect(docs[index]); }
            }}
          />
          <X className="h-4 w-4 text-muted-foreground cursor-pointer hover:text-foreground" onClick={onClose} />
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2 py-2">{showSearchResults ? "Search Results" : "Recent Updates"}</div>
          {loading && <div className="px-2 py-2 text-xs text-muted-foreground">Searching...</div>}
          {docs.length === 0 ? (
            <div className="px-2 py-4 text-sm text-muted-foreground italic">{showSearchResults ? "No matching notes found" : "No recent notes found"}</div>
          ) : (
            <div className="space-y-0.5">
              {docs.map((doc, i) => {
                const isActive = i === index;
                return (
                  <button key={doc.id} onClick={() => onSelect(doc)} onMouseEnter={() => onIndexChange(i)} className={`flex items-center w-full px-3 py-2 text-sm rounded-lg text-left transition-colors group ${isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"}`}>
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium truncate">{doc.title || "Untitled"}</span>
                      <span className={`text-[10px] truncate ${isActive ? "text-accent-foreground/70" : "text-muted-foreground"}`}>{formatDate(doc.mtime)}</span>
                    </div>
                    <ChevronRight className={`h-3.5 w-3.5 ml-auto transition-opacity ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="p-3 bg-muted/30 border-t border-border flex justify-between items-center text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">
          <span>Tip: Select to switch tab or open</span>
          <div className="flex items-center gap-1"><span className="border border-border bg-background px-1 rounded shadow-sm font-bold">ESC</span><span>to close</span></div>
        </div>
      </div>
    </div>
  );
}
