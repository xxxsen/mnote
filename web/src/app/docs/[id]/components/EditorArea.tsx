import React from "react";
import CodeMirror from "@uiw/react-codemirror";
import type { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { FileText } from "lucide-react";
import type { SlashCommand } from "../types";

type EditorAreaProps = {
  content: string;
  editorExtensions: Extension[];
  schedulePreviewUpdate: () => void;
  contentRef: React.RefObject<string>;
  setContent: (val: string) => void;
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

export function EditorArea(props: EditorAreaProps) {
  const {
    content, editorExtensions, schedulePreviewUpdate, contentRef, setContent, onCreateEditor,
    slashMenu, slashIndex, setSlashIndex, filteredSlashCommands, handleSlashAction,
    wikilinkMenu, wikilinkResults, wikilinkLoading, wikilinkIndex, handleWikilinkSelect,
  } = props;

  return (
    <div className="flex-1 overflow-hidden min-h-0">
      <CodeMirror
        value={content}
        height="100%"
        theme="none"
        extensions={editorExtensions}
        placeholder={`start by entering a title here
===

here is the body of note.`}
        onChange={(val) => { contentRef.current = val; setContent(val); schedulePreviewUpdate(); }}
        className="h-full w-full min-w-0 text-base"
        onCreateEditor={onCreateEditor}
        basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: false }}
      />

      {slashMenu.open && (
        <div className="fixed z-[60] bg-popover border border-border rounded-lg shadow-2xl p-1 w-48 animate-in fade-in zoom-in-95 duration-200" style={{ left: slashMenu.x, top: slashMenu.y }}>
          <div className="text-[10px] font-bold text-muted-foreground px-2 py-1 uppercase tracking-widest border-b border-border mb-1">Commands</div>
          <div className="max-h-64 overflow-y-auto no-scrollbar">
            {filteredSlashCommands.map((cmd, index) => (
              <button key={cmd.id} onClick={() => handleSlashAction(cmd.action)} onMouseEnter={() => setSlashIndex(index)} className={`flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-md text-left transition-colors ${index === slashIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"}`}>
                <span className="opacity-70">{cmd.icon}</span>
                <span className="font-medium">{cmd.label}</span>
              </button>
            ))}
            {filteredSlashCommands.length === 0 && <div className="px-2 py-2 text-xs text-muted-foreground italic">No commands found</div>}
          </div>
        </div>
      )}

      {wikilinkMenu.open && (
        <div className="fixed z-[60] bg-popover border border-border rounded-lg shadow-2xl p-1 w-56 animate-in fade-in zoom-in-95 duration-200" style={{ left: wikilinkMenu.x, top: wikilinkMenu.y }}>
          <div className="text-[10px] font-bold text-muted-foreground px-2 py-1 uppercase tracking-widest border-b border-border mb-1 flex items-center gap-1"><FileText className="h-3 w-3" /> Link to Note</div>
          <div className="max-h-64 overflow-y-auto no-scrollbar">
            {wikilinkLoading ? (
              <div className="px-2 py-2 text-xs text-muted-foreground italic">Searching...</div>
            ) : wikilinkResults.length > 0 ? (
              wikilinkResults.map((doc, index) => (
                <button key={doc.id} onClick={() => handleWikilinkSelect(doc.title, doc.id)} className={`flex items-center gap-2 w-full px-2 py-1.5 text-xs rounded-md hover:bg-accent hover:text-accent-foreground text-left transition-colors ${index === wikilinkIndex ? "bg-accent text-accent-foreground" : ""}`}>
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
