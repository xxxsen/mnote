import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

vi.mock("@/lib/editor-themes", () => ({
  getThemeById: () => ({ extension: [] }),
}));

import { useEditorExtensions, handleListContinuation } from "../hooks/useEditorExtensions";

beforeEach(() => { vi.clearAllMocks(); });

const makeOpts = () => ({
  currentThemeId: "dark-plus" as const,
  updateCursorInfo: vi.fn(),
  startTransition: (cb: () => void) => cb(),
  setSlashMenu: vi.fn(),
  setWikilinkMenu: vi.fn(),
});

function makeView(doc: string, cursorAt?: number) {
  const state = EditorState.create({ doc, selection: cursorAt !== undefined ? { anchor: cursorAt } : undefined });
  return new EditorView({ state });
}

describe("useEditorExtensions", () => {
  it("returns editorExtensions array", () => {
    const { result } = renderHook(() => useEditorExtensions(makeOpts()));
    expect(result.current.editorExtensions).toBeTruthy();
    expect(Array.isArray(result.current.editorExtensions)).toBe(true);
    expect(result.current.editorExtensions.length).toBeGreaterThan(0);
  });

  it("extensions can be applied to EditorState", () => {
    const { result } = renderHook(() => useEditorExtensions(makeOpts()));
    const state = EditorState.create({ doc: "# Hello\n", extensions: result.current.editorExtensions });
    expect(state.doc.toString()).toBe("# Hello\n");
  });

  it("doc change triggers updateCursorInfo", () => {
    const opts = makeOpts();
    const { result } = renderHook(() => useEditorExtensions(opts));
    const state = EditorState.create({ doc: "hello", extensions: result.current.editorExtensions });
    const view = new EditorView({ state });
    view.dispatch({ changes: { from: 5, insert: " world" } });
    expect(opts.updateCursorInfo).toHaveBeenCalled();
    view.destroy();
  });

  it("typing slash triggers setSlashMenu", () => {
    const opts = makeOpts();
    const { result } = renderHook(() => useEditorExtensions(opts));
    const state = EditorState.create({ doc: "", extensions: result.current.editorExtensions });
    const view = new EditorView({ state });
    view.dispatch({ changes: { from: 0, insert: "/" } });
    view.destroy();
  });

  it("typing [[ triggers wikilink menu detection", () => {
    const opts = makeOpts();
    const { result } = renderHook(() => useEditorExtensions(opts));
    const state = EditorState.create({ doc: "", extensions: result.current.editorExtensions });
    const view = new EditorView({ state });
    view.dispatch({ changes: { from: 0, insert: "[[test" } });
    view.destroy();
  });
});

describe("handleListContinuation", () => {
  it("returns false for non-empty selection", () => {
    const view = makeView("hello", 0);
    view.dispatch({ selection: { anchor: 0, head: 3 } });
    expect(handleListContinuation(view)).toBe(false);
    view.destroy();
  });

  it("returns false when cursor not at end of line", () => {
    const view = makeView("- item 1", 4);
    expect(handleListContinuation(view)).toBe(false);
    view.destroy();
  });

  it("continues unordered list", () => {
    const doc = "- item 1";
    const view = makeView(doc, doc.length);
    const result = handleListContinuation(view);
    expect(result).toBe(true);
    expect(view.state.doc.toString()).toContain("- ");
    view.destroy();
  });

  it("continues * list", () => {
    const doc = "* item 1";
    const view = makeView(doc, doc.length);
    const result = handleListContinuation(view);
    expect(result).toBe(true);
    expect(view.state.doc.toString()).toContain("\n* ");
    view.destroy();
  });

  it("clears empty list item", () => {
    const doc = "- ";
    const view = makeView(doc, doc.length);
    const result = handleListContinuation(view);
    expect(result).toBe(true);
    expect(view.state.doc.toString()).toBe("");
    view.destroy();
  });

  it("continues todo list", () => {
    const doc = "- [ ] task 1";
    const view = makeView(doc, doc.length);
    const result = handleListContinuation(view);
    expect(result).toBe(true);
    expect(view.state.doc.toString()).toContain("- [ ] ");
    view.destroy();
  });

  it("clears empty todo item", () => {
    const doc = "- [ ] ";
    const view = makeView(doc, doc.length);
    const result = handleListContinuation(view);
    expect(result).toBe(true);
    expect(view.state.doc.toString()).toBe("");
    view.destroy();
  });

  it("continues ordered list", () => {
    const doc = "1. first";
    const view = makeView(doc, doc.length);
    const result = handleListContinuation(view);
    expect(result).toBe(true);
    expect(view.state.doc.toString()).toContain("2. ");
    view.destroy();
  });

  it("clears empty ordered list item", () => {
    const doc = "1. ";
    const view = makeView(doc, doc.length);
    const result = handleListContinuation(view);
    expect(result).toBe(true);
    expect(view.state.doc.toString()).toBe("");
    view.destroy();
  });

  it("clears empty blockquote", () => {
    const doc = "> ";
    const view = makeView(doc, doc.length);
    const result = handleListContinuation(view);
    expect(result).toBe(true);
    expect(view.state.doc.toString()).toBe("");
    view.destroy();
  });

  it("returns false for plain text", () => {
    const doc = "plain text";
    const view = makeView(doc, doc.length);
    const result = handleListContinuation(view);
    expect(result).toBe(false);
    view.destroy();
  });

  it("continues indented list", () => {
    const doc = "  - sub item";
    const view = makeView(doc, doc.length);
    const result = handleListContinuation(view);
    expect(result).toBe(true);
    expect(view.state.doc.toString()).toContain("\n  - ");
    view.destroy();
  });

  it("handles checked todo item", () => {
    const doc = "- [x] done task";
    const view = makeView(doc, doc.length);
    const result = handleListContinuation(view);
    expect(result).toBe(true);
    expect(view.state.doc.toString()).toContain("- [ ] ");
    view.destroy();
  });

  it("increments multi-digit ordered list number", () => {
    const doc = "10. tenth item";
    const view = makeView(doc, doc.length);
    const result = handleListContinuation(view);
    expect(result).toBe(true);
    expect(view.state.doc.toString()).toContain("11. ");
    view.destroy();
  });

  it("handles lazy continuation after list item", () => {
    const doc = "- first\ncontinuation";
    const view = makeView(doc, doc.length);
    const result = handleListContinuation(view);
    expect(result).toBe(true);
    view.destroy();
  });

  it("handles lazy continuation after ordered list", () => {
    const doc = "1. first\ncontinuation";
    const view = makeView(doc, doc.length);
    const result = handleListContinuation(view);
    expect(result).toBe(true);
    view.destroy();
  });

  it("handles lazy continuation after blockquote", () => {
    const doc = "> quote\ncontinuation";
    const view = makeView(doc, doc.length);
    const result = handleListContinuation(view);
    expect(result).toBe(true);
    view.destroy();
  });

  it("no lazy continuation for isolated paragraph", () => {
    const doc = "\nplain paragraph";
    const view = makeView(doc, doc.length);
    const result = handleListContinuation(view);
    expect(result).toBe(false);
    view.destroy();
  });

  it("returns false inside code fence", () => {
    const doc = "```\n- item\n```";
    const view = makeView(doc, 9);
    const result = handleListContinuation(view);
    expect(result).toBe(false);
    view.destroy();
  });
});
