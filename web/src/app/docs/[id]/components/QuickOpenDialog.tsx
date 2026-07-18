import { useRef } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import type { Document } from "@/types";

type Props = {
  show: boolean;
  query: string;
  index: number;
  loading: boolean;
  showSearchResults: boolean;
  docs: Document[];
  onQueryChange: (query: string) => void;
  onIndexChange: (index: number) => void;
  onSelect: (document: Document) => void;
  onClose: () => void;
};

export function QuickOpenDialog(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog
      open={props.show}
      title="Quick open note"
      onClose={props.onClose}
      initialFocusRef={inputRef}
      className="mb-auto mt-[15dvh] max-w-lg overflow-hidden"
      backdropClassName="items-start"
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input
          ref={inputRef}
          aria-label="Search notes"
          placeholder="Quick open note..."
          className="flex-1 border-none bg-transparent text-sm outline-none focus:ring-0"
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (props.docs.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              props.onIndexChange((props.index + 1) % props.docs.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              props.onIndexChange((props.index - 1 + props.docs.length) % props.docs.length);
            } else if (event.key === "Enter") {
              event.preventDefault();
              props.onSelect(props.docs[props.index]);
            }
          }}
        />
        <button type="button" aria-label="Close quick open" onClick={props.onClose} className="min-h-10 min-w-10 text-muted-foreground hover:text-foreground">
          <X className="mx-auto h-4 w-4" />
        </button>
      </div>
      <div role="listbox" aria-label="Notes" className="max-h-[50dvh] overflow-y-auto p-2">
        <div className="px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {props.showSearchResults ? "Search Results" : "Recent Updates"}
        </div>
        {props.loading && <div className="px-2 py-2 text-xs text-muted-foreground">Searching...</div>}
        {props.docs.length === 0 ? (
          <div className="px-2 py-4 text-sm italic text-muted-foreground">
            {props.showSearchResults ? "No matching notes found" : "No recent notes found"}
          </div>
        ) : props.docs.map((document, index) => {
          const active = index === props.index;
          return (
            <button
              type="button"
              role="option"
              aria-selected={active}
              key={document.id}
              onClick={() => props.onSelect(document)}
              onMouseEnter={() => props.onIndexChange(index)}
              className={`group flex w-full items-center rounded-lg px-3 py-2 text-left text-sm ${active ? "bg-accent text-accent-foreground" : "hover:bg-accent"}`}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{document.title || "Untitled"}</span>
                <span className="truncate text-[10px] text-muted-foreground">{formatDate(document.mtime)}</span>
              </span>
              <ChevronRight className={`ml-auto h-3.5 w-3.5 ${active ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} />
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t border-border bg-muted/30 p-3 text-[10px] font-medium uppercase text-muted-foreground">
        <span>Use ↑ ↓ and Enter</span><span>Esc to close</span>
      </div>
    </Dialog>
  );
}
