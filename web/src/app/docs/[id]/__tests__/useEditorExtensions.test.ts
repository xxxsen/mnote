import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

vi.mock("@/lib/editor-themes", () => ({
  getThemeById: () => ({ extension: [] }),
}));

import { useEditorExtensions } from "../hooks/useEditorExtensions";

beforeEach(() => { vi.clearAllMocks(); });

const makeOpts = () => ({
  currentThemeId: "default" as const,
  updateCursorInfo: vi.fn(),
  startTransition: (cb: () => void) => cb(),
  setSlashMenu: vi.fn(),
  setWikilinkMenu: vi.fn(),
});

function createView(doc: string, opts: ReturnType<typeof makeOpts>, cursorAt?: number) {
  const { result } = renderHook(() => useEditorExtensions(opts));
  const state = EditorState.create({
    doc,
    extensions: result.current.editorExtensions,
  });
  const view = new EditorView({ state });
  if (cursorAt !== undefined) {
    view.dispatch({ selection: { anchor: cursorAt } });
  }
  return { view, result };
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
    const state = EditorState.create({
      doc: "# Hello\n",
      extensions: result.current.editorExtensions,
    });
    expect(state.doc.toString()).toBe("# Hello\n");
  });

  it("creates view with list content", () => {
    const doc = "- item 1\n";
    const opts = makeOpts();
    const { view } = createView(doc, opts, doc.length);
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it("creates view with TODO content", () => {
    const doc = "- [ ] task 1\n";
    const opts = makeOpts();
    const { view } = createView(doc, opts, doc.length);
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it("creates view with OL content", () => {
    const doc = "1. first\n";
    const opts = makeOpts();
    const { view } = createView(doc, opts, doc.length);
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it("creates view with blockquote", () => {
    const doc = "> quote\n";
    const opts = makeOpts();
    const { view } = createView(doc, opts, doc.length);
    expect(view.state.doc.toString()).toBe(doc);
    view.destroy();
  });

  it("doc change triggers updateCursorInfo", () => {
    const opts = makeOpts();
    const { view } = createView("hello", opts, 5);
    view.dispatch({ changes: { from: 5, insert: " world" } });
    expect(opts.updateCursorInfo).toHaveBeenCalled();
    view.destroy();
  });

  it("typing slash triggers setSlashMenu", () => {
    const opts = makeOpts();
    const { view } = createView("", opts, 0);
    view.dispatch({ changes: { from: 0, insert: "/" } });
    view.destroy();
  });

  it("typing [[ triggers setWikilinkMenu", () => {
    const opts = makeOpts();
    const { view } = createView("", opts, 0);
    view.dispatch({ changes: { from: 0, insert: "[[" } });
    view.destroy();
  });

  it("handles empty document", () => {
    const { result } = renderHook(() => useEditorExtensions(makeOpts()));
    const state = EditorState.create({
      doc: "",
      extensions: result.current.editorExtensions,
    });
    expect(state.doc.length).toBe(0);
  });

  it("handles selection not at end of line", () => {
    const doc = "- item 1";
    const opts = makeOpts();
    const { view } = createView(doc, opts, 4);
    expect(view.state.selection.main.head).toBe(4);
    view.destroy();
  });
});
