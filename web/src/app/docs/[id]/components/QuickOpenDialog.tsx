import { useRef } from "react";
import { ChevronRight, Search } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogStatus,
} from "@/components/ui/dialog";
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
  const activeDocumentID = props.docs[props.index]?.id;
  return (
    <Dialog
      open={props.show}
      title="Quick open note"
      description="Search recent notes and open the selected result."
      variant="command"
      size="md"
      onClose={props.onClose}
      initialFocusRef={inputRef}
    >
      <DialogHeader />
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 px-4 py-3">
        <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef}
          role="combobox"
          aria-label="Search notes"
          aria-controls="quick-open-results"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-activedescendant={activeDocumentID ? `quick-open-${activeDocumentID}` : undefined}
          placeholder="Type a note title…"
          className="h-11 flex-1 border-none bg-transparent text-sm outline-none focus:ring-0"
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
      </div>
      <DialogBody className="p-2">
        <div id="quick-open-results" role="listbox" aria-label="Notes">
          <div className="px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {props.showSearchResults ? "Search results" : "Recent updates"}
          </div>
          {props.loading ? (
            <DialogStatus variant="loading" className="m-2">Searching notes…</DialogStatus>
          ) : null}
          {!props.loading && props.docs.length === 0 ? (
            <DialogStatus variant="info" className="m-2">
              {props.showSearchResults ? "No matching notes found." : "No recent notes found."}
            </DialogStatus>
          ) : props.docs.map((document, index) => {
            const active = index === props.index;
            return (
              <button
                type="button"
                id={`quick-open-${document.id}`}
                role="option"
                aria-selected={active}
                key={document.id}
                onClick={() => props.onSelect(document)}
                onMouseEnter={() => props.onIndexChange(index)}
                className={`group flex min-h-11 w-full items-center rounded-xl px-3 py-2 text-left text-sm ${
                  active ? "bg-accent text-accent-foreground" : "hover:bg-accent"
                }`}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{document.title || "Untitled"}</span>
                  <span className="truncate text-[10px] text-muted-foreground">
                    {formatDate(document.mtime)}
                  </span>
                </span>
                <ChevronRight
                  className={`ml-auto h-3.5 w-3.5 ${
                    active ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </DialogBody>
      <DialogFooter className="justify-between text-[10px] font-medium uppercase text-muted-foreground">
        <span>Use ↑ ↓ and Enter</span>
        <span>Esc to close</span>
      </DialogFooter>
    </Dialog>
  );
}
