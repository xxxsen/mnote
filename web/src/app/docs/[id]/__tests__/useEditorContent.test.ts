import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { useEditorContent } from "../hooks/useEditorContent";

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); });

function createEditorView(content = ""): EditorView {
  const state = EditorState.create({ doc: content });
  return new EditorView({ state });
}

const makeOpts = (view?: EditorView) => {
  const editorViewRef = { current: view ?? null };
  const contentRef = { current: "" };
  const lastSavedContentRef = { current: "" };
  return { editorViewRef, contentRef, lastSavedContentRef };
};

describe("useEditorContent", () => {
  it("initializes with empty state", () => {
    const { result } = renderHook(() => useEditorContent(makeOpts()));
    expect(result.current.content).toBe("");
    expect(result.current.previewContent).toBe("");
    expect(result.current.hasUnsavedChanges).toBe(false);
    expect(result.current.wordCount).toBe(0);
    expect(result.current.charCount).toBe(0);
    expect(result.current.cursorPos).toEqual({ line: 1, col: 1 });
  });

  it("setContent updates content", () => {
    const { result } = renderHook(() => useEditorContent(makeOpts()));
    act(() => { result.current.setContent("hello"); });
    expect(result.current.content).toBe("hello");
  });

  it("setPreviewContent updates preview", () => {
    const { result } = renderHook(() => useEditorContent(makeOpts()));
    act(() => { result.current.setPreviewContent("preview"); });
    expect(result.current.previewContent).toBe("preview");
  });

  it("setHasUnsavedChanges updates flag", () => {
    const { result } = renderHook(() => useEditorContent(makeOpts()));
    act(() => { result.current.setHasUnsavedChanges(true); });
    expect(result.current.hasUnsavedChanges).toBe(true);
  });

  it("insertTextAtCursor inserts text into editor", () => {
    const view = createEditorView("hello world");
    const opts = makeOpts(view);
    const { result } = renderHook(() => useEditorContent(opts));
    act(() => { result.current.insertTextAtCursor(" test"); });
    expect(opts.contentRef.current).toContain("test");
  });

  it("insertTextAtCursor does nothing without editor", () => {
    const opts = makeOpts();
    const { result } = renderHook(() => useEditorContent(opts));
    act(() => { result.current.insertTextAtCursor("text"); });
    expect(opts.contentRef.current).toBe("");
  });

  it("applyContent replaces editor content", () => {
    const view = createEditorView("old content");
    const opts = makeOpts(view);
    const { result } = renderHook(() => useEditorContent(opts));
    act(() => { result.current.applyContent("new content"); });
    expect(opts.contentRef.current).toBe("new content");
    expect(result.current.content).toBe("new content");
  });

  it("applyContent works without editor", () => {
    const opts = makeOpts();
    const { result } = renderHook(() => useEditorContent(opts));
    act(() => { result.current.applyContent("content"); });
    expect(opts.contentRef.current).toBe("content");
    expect(result.current.content).toBe("content");
  });

  it("handleFormat applies line format", () => {
    const view = createEditorView("hello");
    const opts = makeOpts(view);
    const { result } = renderHook(() => useEditorContent(opts));
    act(() => { result.current.handleFormat("line", "## "); });
    expect(opts.contentRef.current).toBe("## hello");
  });

  it("handleFormat applies wrap format", () => {
    const view = createEditorView("hello");
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    const opts = makeOpts(view);
    const { result } = renderHook(() => useEditorContent(opts));
    act(() => { result.current.handleFormat("wrap", "**", "**"); });
    expect(opts.contentRef.current).toBe("**hello**");
  });

  it("handleFormat does nothing without editor", () => {
    const opts = makeOpts();
    const { result } = renderHook(() => useEditorContent(opts));
    act(() => { result.current.handleFormat("line", "# "); });
    expect(opts.contentRef.current).toBe("");
  });

  it("replacePlaceholder replaces in editor", () => {
    const view = createEditorView("hello {{placeholder}} world");
    const opts = makeOpts(view);
    const { result } = renderHook(() => useEditorContent(opts));
    act(() => { result.current.replacePlaceholder("{{placeholder}}", "replaced"); });
    expect(opts.contentRef.current).toBe("hello replaced world");
  });

  it("replacePlaceholder works without editor via contentRef", () => {
    const opts = makeOpts();
    opts.contentRef.current = "text {{ph}} end";
    const { result } = renderHook(() => useEditorContent(opts));
    act(() => { result.current.replacePlaceholder("{{ph}}", "ok"); });
    expect(opts.contentRef.current).toBe("text ok end");
  });

  it("handleInsertTable inserts markdown table", () => {
    const view = createEditorView("");
    const opts = makeOpts(view);
    const { result } = renderHook(() => useEditorContent(opts));
    act(() => { result.current.handleInsertTable(); });
    expect(opts.contentRef.current).toContain("Header 1");
    expect(opts.contentRef.current).toContain("--------");
  });

  it("handleUndo and handleRedo don't crash without view", () => {
    const { result } = renderHook(() => useEditorContent(makeOpts()));
    act(() => { result.current.handleUndo(); });
    act(() => { result.current.handleRedo(); });
  });

  it("handleUndo and handleRedo work with view", () => {
    const view = createEditorView("original");
    const opts = makeOpts(view);
    const { result } = renderHook(() => useEditorContent(opts));
    act(() => { result.current.handleUndo(); });
    act(() => { result.current.handleRedo(); });
  });

  it("updateCursorInfo updates position", () => {
    const view = createEditorView("line1\nline2\nline3");
    const { result } = renderHook(() => useEditorContent(makeOpts(view)));
    act(() => { result.current.updateCursorInfo(view); });
    expect(result.current.cursorPos.line).toBeGreaterThanOrEqual(1);
  });

  it("schedulePreviewUpdate debounces preview update", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const opts = makeOpts();
    opts.contentRef.current = "word1 word2 word3";
    opts.lastSavedContentRef.current = "different";
    const { result } = renderHook(() => useEditorContent(opts));
    act(() => { result.current.schedulePreviewUpdate(); });
    act(() => { vi.advanceTimersByTime(350); });
    expect(result.current.previewContent).toBe("word1 word2 word3");
    expect(result.current.wordCount).toBe(3);
    expect(result.current.charCount).toBe(17);
    expect(result.current.hasUnsavedChanges).toBe(true);
    vi.useRealTimers();
  });

  it("hasUnsavedChanges is false when content matches saved", () => {
    const opts = makeOpts();
    opts.contentRef.current = "same";
    opts.lastSavedContentRef.current = "same";
    const { result } = renderHook(() => useEditorContent(opts));
    act(() => { result.current.applyContent("same"); });
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  it("handleFormat line toggles off prefix if all lines have it", () => {
    const view = createEditorView("## hello");
    view.dispatch({ selection: { anchor: 3, head: 3 } });
    const opts = makeOpts(view);
    const { result } = renderHook(() => useEditorContent(opts));
    act(() => { result.current.handleFormat("line", "## "); });
    expect(opts.contentRef.current).toBe("hello");
  });

  it("handleFormat line applies prefix to multi-line selection", () => {
    const view = createEditorView("aaa\nbbb\nccc");
    view.dispatch({ selection: { anchor: 0, head: 11 } });
    const opts = makeOpts(view);
    const { result } = renderHook(() => useEditorContent(opts));
    act(() => { result.current.handleFormat("line", "- "); });
    expect(opts.contentRef.current).toBe("- aaa\n- bbb\n- ccc");
  });

  it("handleFormat line toggles off multi-line with prefix", () => {
    const view = createEditorView("- aaa\n- bbb");
    view.dispatch({ selection: { anchor: 0, head: 11 } });
    const opts = makeOpts(view);
    const { result } = renderHook(() => useEditorContent(opts));
    act(() => { result.current.handleFormat("line", "- "); });
    expect(opts.contentRef.current).toBe("aaa\nbbb");
  });

  it("handleFormat wrap unwraps already-wrapped text", () => {
    const view = createEditorView("**hello**");
    view.dispatch({ selection: { anchor: 2, head: 7 } });
    const opts = makeOpts(view);
    const { result } = renderHook(() => useEditorContent(opts));
    act(() => { result.current.handleFormat("wrap", "**", "**"); });
    expect(opts.contentRef.current).toBe("hello");
  });

  it("replacePlaceholder no-op when placeholder not found in editor", () => {
    const view = createEditorView("no match here");
    const opts = makeOpts(view);
    const { result } = renderHook(() => useEditorContent(opts));
    act(() => { result.current.replacePlaceholder("{{missing}}", "val"); });
    expect(view.state.doc.toString()).toBe("no match here");
  });

  it("replacePlaceholder no-op without editor when placeholder absent", () => {
    const opts = makeOpts();
    opts.contentRef.current = "no match";
    const { result } = renderHook(() => useEditorContent(opts));
    act(() => { result.current.replacePlaceholder("{{gone}}", "val"); });
    expect(opts.contentRef.current).toBe("no match");
  });

  it("schedulePreviewUpdate clears previous timer", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const opts = makeOpts();
    opts.contentRef.current = "a b";
    opts.lastSavedContentRef.current = "a b";
    const { result } = renderHook(() => useEditorContent(opts));
    act(() => { result.current.schedulePreviewUpdate(); });
    act(() => { result.current.schedulePreviewUpdate(); });
    act(() => { vi.advanceTimersByTime(350); });
    expect(result.current.hasUnsavedChanges).toBe(false);
    expect(result.current.wordCount).toBe(2);
    vi.useRealTimers();
  });

  it("schedulePreviewUpdate handles empty content", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const opts = makeOpts();
    opts.contentRef.current = "";
    opts.lastSavedContentRef.current = "";
    const { result } = renderHook(() => useEditorContent(opts));
    act(() => { result.current.schedulePreviewUpdate(); });
    act(() => { vi.advanceTimersByTime(350); });
    expect(result.current.wordCount).toBe(0);
    expect(result.current.charCount).toBe(0);
    vi.useRealTimers();
  });

  it("handleFormat line on partially-prefixed multi-line adds prefix to missing lines", () => {
    const view = createEditorView("- aaa\nbbb");
    view.dispatch({ selection: { anchor: 0, head: 9 } });
    const opts = makeOpts(view);
    const { result } = renderHook(() => useEditorContent(opts));
    act(() => { result.current.handleFormat("line", "- "); });
    expect(opts.contentRef.current).toBe("- aaa\n- bbb");
  });
});
