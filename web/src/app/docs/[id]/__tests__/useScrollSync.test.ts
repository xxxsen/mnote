import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useScrollSync } from "../hooks/useScrollSync";

function makeScrollDOM(scrollTop = 0, scrollHeight = 1000, clientHeight = 400) {
  return { scrollTop, scrollHeight, clientHeight };
}

function makePreviewDiv(scrollTop = 0, scrollHeight = 1000, clientHeight = 400) {
  return {
    scrollTop,
    scrollHeight,
    clientHeight,
  } as unknown as HTMLDivElement;
}

beforeEach(() => { vi.clearAllMocks(); });

describe("useScrollSync", () => {
  it("returns expected structure", () => {
    const editorViewRef = { current: null };
    const { result } = renderHook(() => useScrollSync({ loading: false, editorViewRef }));
    expect(result.current.previewRef).toBeDefined();
    expect(result.current.handleEditorScroll).toBeTypeOf("function");
    expect(result.current.handlePreviewScroll).toBeTypeOf("function");
    expect(result.current.scrollingSource).toBeDefined();
    expect(result.current.forcePreviewSyncRef).toBeDefined();
  });

  it("handleEditorScroll syncs preview", () => {
    const scrollDOM = makeScrollDOM(200, 1000, 400);
    const editorViewRef = { current: { scrollDOM } as never };
    const { result } = renderHook(() => useScrollSync({ loading: false, editorViewRef }));

    const preview = makePreviewDiv(0, 2000, 400);
    Object.defineProperty(result.current.previewRef, "current", { value: preview, writable: true });

    act(() => { result.current.handleEditorScroll(); });
    const expected = (200 / 600) * (2000 - 400);
    expect(Math.abs(preview.scrollTop - expected)).toBeLessThan(1);
  });

  it("handleEditorScroll skipped when loading", () => {
    const scrollDOM = makeScrollDOM(200, 1000, 400);
    const editorViewRef = { current: { scrollDOM } as never };
    const { result } = renderHook(() => useScrollSync({ loading: true, editorViewRef }));

    const preview = makePreviewDiv(0, 2000, 400);
    Object.defineProperty(result.current.previewRef, "current", { value: preview, writable: true });

    act(() => { result.current.handleEditorScroll(); });
    expect(preview.scrollTop).toBe(0);
  });

  it("handleEditorScroll skipped when no editor view", () => {
    const editorViewRef = { current: null };
    const { result } = renderHook(() => useScrollSync({ loading: false, editorViewRef }));
    act(() => { result.current.handleEditorScroll(); });
  });

  it("handlePreviewScroll syncs editor", () => {
    const scrollDOM = makeScrollDOM(0, 2000, 400);
    const editorViewRef = { current: { scrollDOM } as never };
    const { result } = renderHook(() => useScrollSync({ loading: false, editorViewRef }));

    const preview = makePreviewDiv(300, 1000, 400);
    Object.defineProperty(result.current.previewRef, "current", { value: preview, writable: true });

    act(() => { result.current.handlePreviewScroll(); });
    const expected = (300 / 600) * (2000 - 400);
    expect(Math.abs(scrollDOM.scrollTop - expected)).toBeLessThan(1);
  });

  it("handlePreviewScroll skipped when loading", () => {
    const scrollDOM = makeScrollDOM(0, 2000, 400);
    const editorViewRef = { current: { scrollDOM } as never };
    const { result } = renderHook(() => useScrollSync({ loading: true, editorViewRef }));

    const preview = makePreviewDiv(300, 1000, 400);
    Object.defineProperty(result.current.previewRef, "current", { value: preview, writable: true });

    act(() => { result.current.handlePreviewScroll(); });
    expect(scrollDOM.scrollTop).toBe(0);
  });

  it("handleEditorScroll ignores when scrolling source is preview", () => {
    const scrollDOM = makeScrollDOM(200, 1000, 400);
    const editorViewRef = { current: { scrollDOM } as never };
    const { result } = renderHook(() => useScrollSync({ loading: false, editorViewRef }));

    const preview = makePreviewDiv(0, 2000, 400);
    Object.defineProperty(result.current.previewRef, "current", { value: preview, writable: true });

    result.current.scrollingSource.current = "preview";
    act(() => { result.current.handleEditorScroll(); });
    expect(preview.scrollTop).toBe(0);
  });

  it("handlePreviewScroll ignores when scrolling source is editor", () => {
    const scrollDOM = makeScrollDOM(0, 2000, 400);
    const editorViewRef = { current: { scrollDOM } as never };
    const { result } = renderHook(() => useScrollSync({ loading: false, editorViewRef }));

    const preview = makePreviewDiv(300, 1000, 400);
    Object.defineProperty(result.current.previewRef, "current", { value: preview, writable: true });

    result.current.scrollingSource.current = "editor";
    act(() => { result.current.handlePreviewScroll(); });
    expect(scrollDOM.scrollTop).toBe(0);
  });

  it("handleEditorScroll no-ops when maxScroll is 0", () => {
    const scrollDOM = makeScrollDOM(0, 400, 400);
    const editorViewRef = { current: { scrollDOM } as never };
    const { result } = renderHook(() => useScrollSync({ loading: false, editorViewRef }));

    const preview = makePreviewDiv(0, 2000, 400);
    Object.defineProperty(result.current.previewRef, "current", { value: preview, writable: true });

    act(() => { result.current.handleEditorScroll(); });
    expect(preview.scrollTop).toBe(0);
  });
});
