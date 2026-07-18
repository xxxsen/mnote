import type { EditorState, Transaction } from "@codemirror/state";

export type MarkdownCommand =
  | { kind: "heading"; level: 1 | 2 | 3 }
  | { kind: "block"; block: "bullet" | "ordered" | "task" | "quote" }
  | { kind: "inline"; mark: "bold" | "italic" | "strike" | "underline" | "code" }
  | { kind: "insert"; item: "link" | "codeBlock" | "table" };

type LineInfo = {
  from: number;
  to: number;
  text: string;
};

const LIST_MARKER_RE = /^(?:[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)/;
const HEADING_RE = /^#{1,6}\s+/;
const QUOTE_RE = /^>\s?/;

function selectedLines(state: EditorState): LineInfo[] {
  const selection = state.selection.main;
  const effectiveTo = selection.to > selection.from &&
    selection.to < state.doc.length &&
    state.doc.lineAt(selection.to).from === selection.to
    ? selection.to - 1
    : selection.to;
  const first = state.doc.lineAt(selection.from);
  const last = state.doc.lineAt(Math.max(selection.from, effectiveTo));
  const lines: LineInfo[] = [];
  for (let number = first.number; number <= last.number; number += 1) {
    const line = state.doc.line(number);
    lines.push({ from: line.from, to: line.to, text: line.text });
  }
  return lines;
}

function splitIndent(text: string): { indent: string; body: string } {
  const match = text.match(/^(\s*)(.*)$/);
  return { indent: match?.[1] ?? "", body: match?.[2] ?? text };
}

function hasTargetMarker(text: string, command: MarkdownCommand): boolean {
  const { body } = splitIndent(text);
  if (command.kind === "heading") {
    return new RegExp(`^#{${command.level}}\\s+`).test(body);
  }
  if (command.kind !== "block") return false;
  if (command.block === "quote") return QUOTE_RE.test(body);
  if (command.block === "bullet") return /^[-*+]\s+(?!\[[ xX]\]\s+)/.test(body);
  if (command.block === "ordered") return /^\d+[.)]\s+/.test(body);
  return /^[-*+]\s+\[[ xX]\]\s+/.test(body);
}

function transformLine(
  text: string,
  command: Extract<MarkdownCommand, { kind: "heading" | "block" }>,
  toggleOff: boolean,
  orderedIndex: number,
): string {
  const { indent, body } = splitIndent(text);

  if (command.kind === "heading") {
    const plain = body.replace(HEADING_RE, "");
    return toggleOff ? `${indent}${plain}` : `${indent}${"#".repeat(command.level)} ${plain}`;
  }

  if (command.block === "quote") {
    const plain = body.replace(QUOTE_RE, "");
    return toggleOff ? `${indent}${plain}` : `${indent}> ${plain}`;
  }

  const plain = body.replace(LIST_MARKER_RE, "");
  if (toggleOff) return `${indent}${plain}`;
  if (command.block === "ordered") return `${indent}${orderedIndex}. ${plain}`;
  if (command.block === "task") return `${indent}- [ ] ${plain}`;
  return `${indent}- ${plain}`;
}

function applyLineCommand(
  state: EditorState,
  command: Extract<MarkdownCommand, { kind: "heading" | "block" }>,
): Transaction {
  const lines = selectedLines(state);
  const nonEmpty = lines.filter((line) => line.text.trim() !== "");
  const toggleOff = nonEmpty.length > 0 && nonEmpty.every((line) => hasTargetMarker(line.text, command));
  const applyEmptyLine = state.selection.main.empty && lines.length === 1;
  let orderedIndex = 0;
  const changes = lines.flatMap((line) => {
    if (line.text.trim() === "" && !applyEmptyLine) return [];
    orderedIndex += 1;
    const next = transformLine(line.text, command, toggleOff, orderedIndex);
    return next === line.text ? [] : [{ from: line.from, to: line.to, insert: next }];
  });
  const changeSet = state.changes(changes);
  const selection = state.selection.main;
  return state.update({
    changes: changeSet,
    selection: {
      anchor: changeSet.mapPos(selection.anchor, 1),
      head: changeSet.mapPos(selection.head, 1),
    },
  });
}

const INLINE_MARKERS: Record<
  Extract<MarkdownCommand, { kind: "inline" }>["mark"],
  [string, string]
> = {
  bold: ["**", "**"],
  italic: ["_", "_"],
  strike: ["~~", "~~"],
  underline: ["<u>", "</u>"],
  code: ["`", "`"],
};

function applyInlineCommand(
  state: EditorState,
  command: Extract<MarkdownCommand, { kind: "inline" }>,
): Transaction {
  const selection = state.selection.main;
  const [open, close] = INLINE_MARKERS[command.mark];
  if (selection.empty) {
    return state.update({
      changes: { from: selection.from, insert: open + close },
      selection: { anchor: selection.from + open.length },
    });
  }

  const selected = state.sliceDoc(selection.from, selection.to);
  const before = state.sliceDoc(Math.max(0, selection.from - open.length), selection.from);
  const after = state.sliceDoc(selection.to, Math.min(state.doc.length, selection.to + close.length));
  if (before === open && after === close) {
    const changes = state.changes([
      { from: selection.from - open.length, to: selection.from, insert: "" },
      { from: selection.to, to: selection.to + close.length, insert: "" },
    ]);
    return state.update({
      changes,
      selection: {
        anchor: changes.mapPos(selection.anchor, -1),
        head: changes.mapPos(selection.head, -1),
      },
    });
  }
  return state.update({
    changes: { from: selection.from, to: selection.to, insert: open + selected + close },
    selection: {
      anchor: selection.from + open.length,
      head: selection.to + open.length,
    },
  });
}

function withBlockSpacing(state: EditorState, value: string): string {
  const selection = state.selection.main;
  const before = state.sliceDoc(0, selection.from);
  const after = state.sliceDoc(selection.to);
  const prefix = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
  const suffix = after.length > 0 && !after.startsWith("\n") ? "\n" : "";
  return `${prefix}${value}${suffix}`;
}

function applyInsertCommand(
  state: EditorState,
  command: Extract<MarkdownCommand, { kind: "insert" }>,
): Transaction {
  const selection = state.selection.main;
  const selected = state.sliceDoc(selection.from, selection.to);
  if (command.item === "link") {
    if (selection.empty) {
      const value = "[link text](https://)";
      return state.update({
        changes: { from: selection.from, insert: value },
        selection: { anchor: selection.from + 1, head: selection.from + 10 },
      });
    }
    const value = `[${selected}](https://)`;
    const urlFrom = selection.from + selected.length + 3;
    return state.update({
      changes: { from: selection.from, to: selection.to, insert: value },
      selection: { anchor: urlFrom, head: urlFrom + "https://".length },
    });
  }
  if (command.item === "codeBlock") {
    const body = selected || "code";
    const value = withBlockSpacing(state, `\`\`\`\n${body}\n\`\`\``);
    return state.update({
      changes: { from: selection.from, to: selection.to, insert: value },
    });
  }
  const table = "| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |";
  return state.update({
    changes: {
      from: selection.from,
      to: selection.to,
      insert: withBlockSpacing(state, table),
    },
  });
}

export function applyMarkdownCommand(state: EditorState, command: MarkdownCommand): Transaction {
  if (command.kind === "heading" || command.kind === "block") {
    return applyLineCommand(state, command);
  }
  if (command.kind === "inline") return applyInlineCommand(state, command);
  return applyInsertCommand(state, command);
}
