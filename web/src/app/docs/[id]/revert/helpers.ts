import type { DiffRow } from "@/lib/diff";

export type MobileDiffBlock = {
  kind: "change" | "context";
  startIndex: number;
  rows: DiffRow[];
};

function isChangedRow(row: DiffRow) {
  return row.left?.type === "removed" || row.right?.type === "added";
}

export function buildMobileDiffBlocks(rows: DiffRow[]): MobileDiffBlock[] {
  return rows.reduce<MobileDiffBlock[]>((blocks, row, index) => {
    const kind = isChangedRow(row) ? "change" : "context";
    const previous = blocks.at(-1);
    if (previous?.kind === kind) {
      previous.rows.push(row);
      return blocks;
    }
    blocks.push({ kind, startIndex: index, rows: [row] });
    return blocks;
  }, []);
}

export function isEditableEventTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}
