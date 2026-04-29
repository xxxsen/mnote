import { describe, it, expect } from "vitest";
import { computeDiff } from "../diff";

describe("computeDiff", () => {
  it("returns same rows for identical text", () => {
    const rows = computeDiff("a\nb", "a\nb");
    expect(rows).toEqual([
      { left: { value: "a", type: "same" }, right: { value: "a", type: "same" } },
      { left: { value: "b", type: "same" }, right: { value: "b", type: "same" } },
    ]);
  });

  it("detects added lines", () => {
    const rows = computeDiff("a", "a\nb");
    const addedRow = rows.find((r) => r.right?.type === "added");
    expect(addedRow).toBeTruthy();
    expect(addedRow?.right?.value).toBe("b");
    expect(addedRow?.left).toBeUndefined();
  });

  it("detects removed lines", () => {
    const rows = computeDiff("a\nb", "a");
    const removedRow = rows.find((r) => r.left?.type === "removed");
    expect(removedRow).toBeTruthy();
    expect(removedRow?.left?.value).toBe("b");
    expect(removedRow?.right).toBeUndefined();
  });

  it("handles empty strings", () => {
    const rows = computeDiff("", "");
    expect(rows).toEqual([
      { left: { value: "", type: "same" }, right: { value: "", type: "same" } },
    ]);
  });

  it("handles complete replacement", () => {
    const rows = computeDiff("x", "y");
    expect(rows.length).toBe(2);
    expect(rows.some((r) => r.left?.type === "removed" && r.left?.value === "x")).toBe(true);
    expect(rows.some((r) => r.right?.type === "added" && r.right?.value === "y")).toBe(true);
  });

  it("handles multiline diff", () => {
    const rows = computeDiff("a\nb\nc", "a\nx\nc");
    expect(rows[0]).toEqual({
      left: { value: "a", type: "same" },
      right: { value: "a", type: "same" },
    });
    expect(rows[rows.length - 1]).toEqual({
      left: { value: "c", type: "same" },
      right: { value: "c", type: "same" },
    });
  });

  it("handles adding to empty", () => {
    const rows = computeDiff("", "a\nb");
    expect(rows.some((r) => r.right?.type === "added" && r.right?.value === "a")).toBe(true);
    expect(rows.some((r) => r.right?.type === "added" && r.right?.value === "b")).toBe(true);
  });

  it("handles removing everything", () => {
    const rows = computeDiff("a\nb", "");
    expect(rows.some((r) => r.left?.type === "removed" && r.left?.value === "a")).toBe(true);
    expect(rows.some((r) => r.left?.type === "removed" && r.left?.value === "b")).toBe(true);
  });
});
