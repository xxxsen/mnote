import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { EditorView } from "@codemirror/view";
import type { SlashActionContext, SlashCommand } from "../types";
import { SLASH_COMMANDS } from "../slash-commands";

export function useSlashMenu(opts: {
  editorViewRef: React.RefObject<EditorView | null>;
  handleFormat: (type: "wrap" | "line", prefix: string, suffix?: string) => void;
  handleInsertTable: () => void;
  insertTextAtCursor: (text: string) => void;
}) {
  const { editorViewRef, handleFormat, handleInsertTable, insertTextAtCursor } = opts;

  const [slashMenu, setSlashMenu] = useState<{ open: boolean; x: number; y: number; filter: string }>({
    open: false, x: 0, y: 0, filter: "",
  });
  const [slashIndex, setSlashIndex] = useState(0);

  const filteredSlashCommands = useMemo(() => {
    const query = slashMenu.filter.trim().toLowerCase();
    if (!query) return SLASH_COMMANDS;
    return SLASH_COMMANDS.filter((cmd: SlashCommand) => {
      if (cmd.label.toLowerCase().includes(query)) return true;
      if (cmd.id.toLowerCase().includes(query)) return true;
      return (cmd.keywords || []).some((kw) => kw.toLowerCase().includes(query));
    });
  }, [slashMenu.filter]);

  useEffect(() => {
    setSlashIndex(0); // eslint-disable-line react-hooks/set-state-in-effect -- reset index when menu opens or filter changes
  }, [slashMenu.open, slashMenu.filter]);

  const handleSlashAction = useCallback((action: (ctx: SlashActionContext) => void) => {
    const view = editorViewRef.current;
    if (!view) return;

    const { from } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);
    const lineText = line.text;
    const relativePos = from - line.from;
    const lastSlashIdx = lineText.lastIndexOf("/", relativePos - 1);

    if (lastSlashIdx !== -1) {
      view.dispatch({
        changes: { from: line.from + lastSlashIdx, to: from, insert: "" }
      });
    }

    action({ handleFormat, handleInsertTable, insertTextAtCursor });
    setSlashIndex(0);
    setSlashMenu(prev => ({ ...prev, open: false }));
  }, [editorViewRef, handleFormat, handleInsertTable, insertTextAtCursor]);

  const handleSlashKeyDown = useCallback((e: React.KeyboardEvent | KeyboardEvent) => {
    if (!slashMenu.open) return false;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filteredSlashCommands.length === 0) return true;
      setSlashIndex((prev) => (prev + 1) % filteredSlashCommands.length);
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filteredSlashCommands.length === 0) return true;
      setSlashIndex((prev) => (prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
      return true;
    }
    if (e.key === "Enter") {
      if (filteredSlashCommands.length === 0) return false;
      e.preventDefault();
      const selected = filteredSlashCommands[slashIndex] ?? filteredSlashCommands[0];
      handleSlashAction(selected.action);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setSlashMenu((prev) => ({ ...prev, open: false }));
      return true;
    }
    return false;
  }, [filteredSlashCommands, handleSlashAction, slashIndex, slashMenu.open]);

  const slashKeydownRef = useRef(handleSlashKeyDown);
  useEffect(() => {
    slashKeydownRef.current = handleSlashKeyDown;
  }, [handleSlashKeyDown]);

  return {
    slashMenu, setSlashMenu,
    slashIndex, setSlashIndex,
    filteredSlashCommands,
    handleSlashAction,
    handleSlashKeyDown,
    slashKeydownRef,
  };
}
