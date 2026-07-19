import { describe, expect, it } from "vitest";

import type { DiffRow } from "@/lib/diff";
import { buildMobileDiffBlocks, isEditableEventTarget } from "../helpers";

describe("revert diff helpers", () => {
  it("groups consecutive changes and context without losing source indexes", () => {
    const rows: DiffRow[] = [
      { left: { type: "same", value: "before" }, right: { type: "same", value: "before" } },
      { left: { type: "removed", value: "old" } },
      { right: { type: "added", value: "new" } },
      { left: { type: "same", value: "after" }, right: { type: "same", value: "after" } },
    ];
    expect(buildMobileDiffBlocks(rows)).toEqual([
      { kind: "context", startIndex: 0, rows: [rows[0]] },
      { kind: "change", startIndex: 1, rows: [rows[1], rows[2]] },
      { kind: "context", startIndex: 3, rows: [rows[3]] },
    ]);
  });

  it("keeps a long unbroken token inside a change block", () => {
    const token = "https://example.test/" + "a".repeat(500);
    const blocks = buildMobileDiffBlocks([{ right: { type: "added", value: token } }]);
    expect(blocks[0].rows[0].right?.value).toBe(token);
  });

  it("recognizes editable keyboard targets", () => {
    const input = document.createElement("input");
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    expect(isEditableEventTarget(input)).toBe(true);
    expect(isEditableEventTarget(editor)).toBe(true);
    expect(isEditableEventTarget(document.createElement("button"))).toBe(false);
  });
});
