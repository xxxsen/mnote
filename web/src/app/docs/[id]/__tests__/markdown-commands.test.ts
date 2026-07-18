import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";

import {
  applyMarkdownCommand,
  type MarkdownCommand,
} from "../commands/markdown-commands";

function run(
  content: string,
  from: number,
  to: number,
  command: MarkdownCommand,
) {
  const state = EditorState.create({
    doc: content,
    selection: { anchor: from, head: to },
  });
  return applyMarkdownCommand(state, command).state;
}

function apply(
  content: string,
  from: number,
  to: number,
  command: MarkdownCommand,
) {
  return run(content, from, to, command).doc.toString();
}

describe("markdown command registry", () => {
  it("replaces an existing heading marker", () => {
    expect(apply("## Heading", 0, 0, { kind: "heading", level: 1 }))
      .toBe("# Heading");
  });

  it("converts list markers without stacking and preserves indentation", () => {
    expect(apply("  - one\n    - two", 0, 17, { kind: "block", block: "ordered" }))
      .toBe("  1. one\n    2. two");
    expect(apply("1. one\n2. two", 0, 13, { kind: "block", block: "task" }))
      .toBe("- [ ] one\n- [ ] two");
  });

  it("numbers only non-empty selected lines continuously", () => {
    expect(apply("one\n\nthree", 0, 10, { kind: "block", block: "ordered" }))
      .toBe("1. one\n\n2. three");
  });

  it("does not include the next line when selection ends at its start", () => {
    expect(apply("one\ntwo\nthree", 0, 4, { kind: "heading", level: 2 }))
      .toBe("## one\ntwo\nthree");
  });

  it("toggles a matching multiline marker off and preserves blank lines", () => {
    expect(apply("- one\n\n- two", 0, 12, { kind: "block", block: "bullet" }))
      .toBe("one\n\ntwo");
  });

  it("applies line commands to a single empty cursor line", () => {
    expect(apply("", 0, 0, { kind: "heading", level: 2 })).toBe("## ");
    expect(apply("", 0, 0, { kind: "block", block: "ordered" })).toBe("1. ");
    expect(apply("", 0, 0, { kind: "block", block: "quote" })).toBe("> ");
  });

  it("inserts paired inline markers and places the cursor between them", () => {
    const state = run("", 0, 0, { kind: "inline", mark: "bold" });
    expect(state.doc.toString()).toBe("****");
    expect(state.selection.main.anchor).toBe(2);
  });

  it("wraps and toggles inline selections", () => {
    const wrapped = run("bold", 0, 4, { kind: "inline", mark: "bold" });
    expect(wrapped.doc.toString()).toBe("**bold**");
    const unwrapped = apply("**bold**", 2, 6, { kind: "inline", mark: "bold" });
    expect(unwrapped).toBe("bold");
  });

  it("selects link text or the URL placeholder as appropriate", () => {
    const empty = run("", 0, 0, { kind: "insert", item: "link" });
    expect(empty.doc.toString()).toBe("[link text](https://)");
    expect(empty.sliceDoc(
      empty.selection.main.from,
      empty.selection.main.to,
    )).toBe("link text");

    const selected = run("label", 0, 5, { kind: "insert", item: "link" });
    expect(selected.doc.toString()).toBe("[label](https://)");
    expect(selected.sliceDoc(
      selected.selection.main.from,
      selected.selection.main.to,
    )).toBe("https://");
  });

  it("separates an inserted code block without triple blank lines", () => {
    const result = apply("beforeafter", 6, 6, { kind: "insert", item: "codeBlock" });
    expect(result).toBe("before\n```\ncode\n```\nafter");
    expect(result).not.toContain("\n\n\n");
  });

  it("replaces an empty current line with a table without an extra leading gap", () => {
    expect(apply("before\n\nafter", 7, 7, { kind: "insert", item: "table" }))
      .toBe("before\n| Header 1 | Header 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |\nafter");
  });
});
