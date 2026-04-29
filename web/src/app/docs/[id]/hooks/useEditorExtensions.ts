import { useCallback, useMemo } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { LanguageDescription, syntaxTree } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { styleTags } from "@lezer/highlight";
import { Compartment, Prec } from "@codemirror/state";
import { indentWithTab } from "@codemirror/commands";
import { getThemeById, type ThemeId } from "@/lib/editor-themes";
import { goAutocompleteExtension } from "@/lib/go-autocomplete";

export const themeCompartment = new Compartment();

type SetMenu<T> = React.Dispatch<React.SetStateAction<T>>;
type SlashMenuState = { open: boolean; x: number; y: number; filter: string };
type WikilinkMenuState = { open: boolean; x: number; y: number; query: string; from: number };

function detectSlashMenu(view: EditorView, lineText: string, relativePos: number, startTransition: (cb: () => void) => void, setSlashMenu: SetMenu<SlashMenuState>): boolean {
  const lastSlashIndex = lineText.lastIndexOf("/", relativePos - 1);
  if (lastSlashIndex === -1 || (lastSlashIndex !== 0 && lineText[lastSlashIndex - 1] !== " ")) return false;
  const filter = lineText.slice(lastSlashIndex + 1, relativePos);
  if (filter.includes(" ")) return false;
  const pos = view.state.selection.main.head;
  const coords = view.coordsAtPos(pos);
  if (!coords) return false;
  startTransition(() => { setSlashMenu({ open: true, x: coords.left, y: coords.bottom + 5, filter }); });
  return true;
}

function detectWikilinkMenu(ctx: {
  view: EditorView; lineText: string; relativePos: number; lineFrom: number;
  startTransition: (cb: () => void) => void; setSlashMenu: SetMenu<SlashMenuState>; setWikilinkMenu: SetMenu<WikilinkMenuState>;
}) {
  const { view, lineText, relativePos, lineFrom, startTransition, setSlashMenu, setWikilinkMenu } = ctx;
  const textBefore = lineText.slice(0, relativePos);
  const wikilinkMatch = textBefore.match(/\[\[([^\]\[]*)$/);
  if (wikilinkMatch) {
    const query = wikilinkMatch[1];
    const wlFrom = lineFrom + (wikilinkMatch.index ?? 0);
    const pos = view.state.selection.main.head;
    const coords = view.coordsAtPos(pos);
    if (coords) {
      startTransition(() => { setWikilinkMenu({ open: true, x: coords.left, y: coords.bottom + 5, query, from: wlFrom }); });
    }
  } else {
    startTransition(() => { setWikilinkMenu(prev => prev.open ? { ...prev, open: false } : prev); });
  }
  startTransition(() => { setSlashMenu(prev => prev.open ? { ...prev, open: false } : prev); });
}

function isInsideCodeRegion(state: ReturnType<typeof syntaxTree> extends infer T ? T : never, pos: number): boolean {
  let node: { name: string; parent: typeof node } | null = state.resolveInner(pos, -1);
  while (node !== null) {
    if (node.name === "FencedCode" || node.name === "CodeBlock" || node.name === "InlineCode" || node.name === "CodeText") return true;
    node = node.parent;
  }
  return false;
}

export function handleListContinuation(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;
  const tree = syntaxTree(view.state);
  const checkPos = Math.max(0, selection.head - 1);
  if (isInsideCodeRegion(tree, selection.head) || isInsideCodeRegion(tree, checkPos)) return false;

  const line = view.state.doc.lineAt(selection.head);
  if (selection.head !== line.to) return false;

  const emptyQuoteMatch = line.text.match(/^(\s*)(?:>\s*)+$/);
  if (emptyQuoteMatch) {
    const indent = emptyQuoteMatch[1];
    view.dispatch({ changes: { from: line.from, to: line.to, insert: indent }, selection: { anchor: line.from + indent.length } });
    return true;
  }

  const todoMatch = line.text.match(/^(\s*)-\s*\[([ xX])\]\s*(.*)$/);
  if (todoMatch) {
    if (!todoMatch[3].trim()) {
      view.dispatch({ changes: { from: line.from, to: line.to, insert: todoMatch[1] }, selection: { anchor: line.from + todoMatch[1].length } });
      return true;
    }
    const insertText = `\n${todoMatch[1]}- [ ] `;
    view.dispatch({ changes: { from: selection.head, to: selection.head, insert: insertText }, selection: { anchor: selection.head + insertText.length } });
    return true;
  }

  const ulMatch = line.text.match(/^(\s*)([-*])\s(.*)$/);
  if (ulMatch) {
    if (!ulMatch[3].trim()) {
      view.dispatch({ changes: { from: line.from, to: line.to, insert: ulMatch[1] }, selection: { anchor: line.from + ulMatch[1].length } });
      return true;
    }
    const insertText = `\n${ulMatch[1]}${ulMatch[2]} `;
    view.dispatch({ changes: { from: selection.head, to: selection.head, insert: insertText }, selection: { anchor: selection.head + insertText.length } });
    return true;
  }

  const olMatch = line.text.match(/^(\s*)(\d+)\.\s(.*)$/);
  if (olMatch) {
    if (!olMatch[3].trim()) {
      view.dispatch({ changes: { from: line.from, to: line.to, insert: olMatch[1] }, selection: { anchor: line.from + olMatch[1].length } });
      return true;
    }
    const nextNum = parseInt(olMatch[2], 10) + 1;
    const insertText = `\n${olMatch[1]}${nextNum}. `;
    view.dispatch({ changes: { from: selection.head, to: selection.head, insert: insertText }, selection: { anchor: selection.head + insertText.length } });
    return true;
  }

  return handleLazyContinuation(view, line, selection.head);
}

function handleLazyContinuation(view: EditorView, line: { text: string; number: number }, head: number): boolean {
  const lineText = line.text;
  if (lineText.trim() === "" || /^\s*(?:>\s*)+/.test(lineText) || /^\s+/.test(lineText)) return false;

  let checkLineNum = line.number - 1;
  while (checkLineNum >= 1) {
    const checkLine = view.state.doc.line(checkLineNum);
    const checkText = checkLine.text.trim();
    if (checkText === "") break;
    if (/^\s*([-*])\s/.test(checkLine.text) || /^\s*\d+\.\s/.test(checkLine.text) || /^\s*-\s*\[[ xX]\]/.test(checkLine.text)) {
      view.dispatch({ changes: { from: head, to: head, insert: "\n" }, selection: { anchor: head + 1 } });
      return true;
    }
    if (/^\s*(?:>\s*)+/.test(checkLine.text)) {
      view.dispatch({ changes: { from: head, to: head, insert: "\n" }, selection: { anchor: head + 1 } });
      return true;
    }
    checkLineNum--;
  }
  return false;
}

export function useEditorExtensions(opts: {
  currentThemeId: ThemeId;
  updateCursorInfo: (view: EditorView) => void;
  startTransition: (cb: () => void) => void;
  setSlashMenu: React.Dispatch<React.SetStateAction<{ open: boolean; x: number; y: number; filter: string }>>;
  setWikilinkMenu: React.Dispatch<React.SetStateAction<{ open: boolean; x: number; y: number; query: string; from: number }>>;
}) {
  const { currentThemeId, updateCursorInfo, startTransition, setSlashMenu, setWikilinkMenu } = opts;

  const handleListEnter = useCallback((view: EditorView) => handleListContinuation(view), []);

  const editorExtensions = useMemo(() => [
    markdown({
      codeLanguages: (info) => {
        const languageName = info.includes(':') ? info.split(':')[0] : info;
        return LanguageDescription.matchLanguageName(languages, languageName);
      },
      extensions: [{ props: [styleTags({ HeaderMark: tags.heading })] }]
    }),
    themeCompartment.of(getThemeById(currentThemeId).extension),
    EditorView.lineWrapping,
    goAutocompleteExtension,
    Prec.highest(keymap.of([{ key: "Enter", run: handleListEnter }])),
    keymap.of([indentWithTab]),
    EditorView.updateListener.of((update) => {
      if (update.selectionSet || update.docChanged) {
        updateCursorInfo(update.view);
        if (update.docChanged) {
          const state = update.view.state;
          const pos = state.selection.main.head;
          const line = state.doc.lineAt(pos);
          const lineText = line.text;
          const relativePos = pos - line.from;
          if (detectSlashMenu(update.view, lineText, relativePos, startTransition, setSlashMenu)) return;
          detectWikilinkMenu({ view: update.view, lineText, relativePos, lineFrom: line.from, startTransition, setSlashMenu, setWikilinkMenu });
        }
      }
    }),
  ], [updateCursorInfo, currentThemeId, handleListEnter, startTransition, setSlashMenu, setWikilinkMenu]);

  return { editorExtensions };
}
