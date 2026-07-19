import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { FileText } from "lucide-react";
import type { SlashCommand } from "../types";

type EditorAreaProps = {
  content: string;
  editorExtensions: Extension[];
  publishContent: (value: string) => void;
  onCreateEditor: (view: EditorView) => void;
  slashMenu: { open: boolean; x: number; y: number; filter: string };
  slashIndex: number;
  setSlashIndex: (i: number) => void;
  filteredSlashCommands: SlashCommand[];
  handleSlashAction: (action: SlashCommand["action"]) => void;
  wikilinkMenu: { open: boolean; x: number; y: number; query: string; from: number };
  wikilinkResults: { id: string; title: string }[];
  wikilinkLoading: boolean;
  wikilinkIndex: number;
  handleWikilinkSelect: (title: string, id: string) => void;
};

export function clampMenuPosition(x: number, y: number, width: number, height: number) {
  if (typeof window === "undefined") return { left: x, top: y };
  return {
    left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
    top: Math.max(8, Math.min(y, window.innerHeight - Math.min(height, window.innerHeight - 16) - 8)),
  };
}

export function EditorArea(props: EditorAreaProps) {
  const {
    content, editorExtensions, publishContent, onCreateEditor,
    slashMenu, slashIndex, setSlashIndex, filteredSlashCommands, handleSlashAction,
    wikilinkMenu, wikilinkResults, wikilinkLoading, wikilinkIndex, handleWikilinkSelect,
  } = props;

  const activeMenuId = slashMenu.open ? "editor-slash-menu" : wikilinkMenu.open ? "editor-wikilink-menu" : undefined;
  const accessibilityExtension = useMemo(() => EditorView.contentAttributes.of({
    "aria-controls": activeMenuId || "",
    "aria-expanded": String(Boolean(activeMenuId)),
    "aria-activedescendant": slashMenu.open ? "slash-option-" + String(slashIndex) : wikilinkMenu.open ? "wikilink-option-" + String(wikilinkIndex) : "",
  }), [activeMenuId, slashIndex, slashMenu.open, wikilinkIndex, wikilinkMenu.open]);
  const slashPosition = clampMenuPosition(slashMenu.x, slashMenu.y, 192, 280);
  const wikilinkPosition = clampMenuPosition(wikilinkMenu.x, wikilinkMenu.y, 224, 280);

  return (
    <div className="flex-1 overflow-hidden min-h-0">
      <CodeMirror
        value={content}
        height="100%"
        theme="none"
        extensions={[...editorExtensions, accessibilityExtension]}
        placeholder={`start by entering a title here
===

here is the body of note.`}
        onChange={(val) => publishContent(val)}
        className="h-full w-full min-w-0 text-base"
        onCreateEditor={onCreateEditor}
        basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: false }}
      />

      {slashMenu.open && (
        <div id="editor-slash-menu" role="listbox" aria-label="Editor commands" className="fixed z-[220] w-48 max-w-[calc(100vw-16px)] rounded-lg border border-border bg-popover p-1 shadow-2xl" style={slashPosition}>
          <div className="mb-1 border-b border-border px-2 py-1 text-xs font-semibold text-muted-foreground">Commands</div>
          <div className="max-h-64 overflow-y-auto no-scrollbar">
            {filteredSlashCommands.map((cmd, index) => (
              <button id={"slash-option-" + String(index)} role="option" aria-selected={index === slashIndex} key={cmd.id} onClick={() => handleSlashAction(cmd.action)} onMouseEnter={() => setSlashIndex(index)} className={`flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-md text-left transition-colors ${index === slashIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"}`}>
                <span className="opacity-70">{cmd.icon}</span>
                <span className="font-medium">{cmd.label}</span>
              </button>
            ))}
            {filteredSlashCommands.length === 0 && <div className="px-2 py-2 text-xs text-muted-foreground italic">No commands found</div>}
          </div>
        </div>
      )}

      {wikilinkMenu.open && (
        <div id="editor-wikilink-menu" role="listbox" aria-label="Link to note" className="fixed z-[220] w-56 max-w-[calc(100vw-16px)] rounded-lg border border-border bg-popover p-1 shadow-2xl" style={wikilinkPosition}>
          <div className="mb-1 flex items-center gap-1 border-b border-border px-2 py-1 text-xs font-semibold text-muted-foreground"><FileText className="h-3 w-3" aria-hidden="true" /> Link to note</div>
          <div className="max-h-64 overflow-y-auto no-scrollbar">
            {wikilinkLoading ? (
              <div className="px-2 py-2 text-xs text-muted-foreground italic">Searching...</div>
            ) : wikilinkResults.length > 0 ? (
              wikilinkResults.map((doc, index) => (
                <button id={"wikilink-option-" + String(index)} role="option" aria-selected={index === wikilinkIndex} key={doc.id} onClick={() => handleWikilinkSelect(doc.title, doc.id)} className={`flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-md hover:bg-accent hover:text-accent-foreground text-left transition-colors ${index === wikilinkIndex ? "bg-accent text-accent-foreground" : ""}`}>
                  <FileText className="h-3.5 w-3.5 opacity-50 flex-shrink-0" />
                  <span className="font-medium truncate">{doc.title}</span>
                </button>
              ))
            ) : (
              <div className="px-2 py-2 text-xs text-muted-foreground italic">No documents found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
