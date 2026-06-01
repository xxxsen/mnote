import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { useEditorLifecycle } from "../hooks/useEditorLifecycle";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(() => { vi.restoreAllMocks(); });

const makeDocDetail = (content = "# Hello") => ({
  document: { id: "d1", title: "Test", content, ctime: 0, mtime: 0 },
  tag_ids: [],
  tags: [],
});

const makeOpts = (overrides: Record<string, unknown> = {}) => {
  const contentRef = { current: "" };
  const lastSavedContentRef = { current: "" };
  return {
    id: "d1",
    hasUnsavedChanges: false,
    contentRef,
    lastSavedContentRef,
    documentActions: {
      getDocument: vi.fn().mockResolvedValue(makeDocDetail()),
    },
    extractTitleFromContent: (v: string) => {
      const match = v.match(/^#\s+(.+)/m);
      return match ? match[1].trim() : "";
    },
    onLoadingChange: vi.fn(),
    onLoaded: vi.fn(),
    onLoadError: vi.fn(),
    requestSave: vi.fn(),
    ...overrides,
  };
};

describe("useEditorLifecycle", () => {
  it("fetches document on mount and calls onLoaded", async () => {
    const opts = makeOpts();
    renderHook(() => useEditorLifecycle(opts));
    await waitFor(() => { expect(opts.onLoaded).toHaveBeenCalled(); });
    expect(opts.onLoadingChange).toHaveBeenCalledWith(true);
    expect(opts.onLoadingChange).toHaveBeenCalledWith(false);
    const call = opts.onLoaded.mock.calls[0][0];
    expect(call.initialContent).toBe("# Hello");
    expect(call.hasDraftOverride).toBe(false);
  });

  it("uses draft from localStorage if different from server", async () => {
    localStorage.setItem("mnote:draft:d1", JSON.stringify({ content: "# Draft Content" }));
    const opts = makeOpts();
    renderHook(() => useEditorLifecycle(opts));
    await waitFor(() => { expect(opts.onLoaded).toHaveBeenCalled(); });
    const call = opts.onLoaded.mock.calls[0][0];
    expect(call.initialContent).toBe("# Draft Content");
    expect(call.hasDraftOverride).toBe(true);
  });

  it("ignores draft if same as server content", async () => {
    localStorage.setItem("mnote:draft:d1", JSON.stringify({ content: "# Hello" }));
    const opts = makeOpts();
    renderHook(() => useEditorLifecycle(opts));
    await waitFor(() => { expect(opts.onLoaded).toHaveBeenCalled(); });
    const call = opts.onLoaded.mock.calls[0][0];
    expect(call.hasDraftOverride).toBe(false);
  });

  it("handles fetch error", async () => {
    const opts = makeOpts({
      documentActions: {
        getDocument: vi.fn().mockRejectedValue(new Error("fetch fail")),
      },
    });
    renderHook(() => useEditorLifecycle(opts));
    await waitFor(() => { expect(opts.onLoadError).toHaveBeenCalled(); });
  });

  it("auto-save interval is set up", async () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const opts = makeOpts();
    renderHook(() => useEditorLifecycle(opts));
    await waitFor(() => { expect(opts.onLoaded).toHaveBeenCalled(); });
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 10000);
    setIntervalSpy.mockRestore();
  });

  it("saves draft to localStorage when hasUnsavedChanges is true", async () => {
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    const opts = makeOpts({ hasUnsavedChanges: true });
    opts.contentRef.current = "# Draft";
    renderHook(() => useEditorLifecycle(opts));
    await waitFor(() => { expect(opts.onLoaded).toHaveBeenCalled(); });
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 400);
    setTimeoutSpy.mockRestore();
  });

  it("writes draft contents after the debounce timer fires", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const opts = makeOpts({ hasUnsavedChanges: true });
    renderHook(() => useEditorLifecycle(opts));
    await vi.waitFor(() => { expect(opts.onLoaded).toHaveBeenCalled(); });
    opts.contentRef.current = "# Draft Body";
    await vi.advanceTimersByTimeAsync(500);
    const stored = localStorage.getItem("mnote:draft:d1");
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.content).toBe("# Draft Body");
    vi.useRealTimers();
  });

  it("cleans invalid draft from localStorage", async () => {
    localStorage.setItem("mnote:draft:d1", "not-json{{{");
    const opts = makeOpts();
    renderHook(() => useEditorLifecycle(opts));
    await waitFor(() => { expect(opts.onLoaded).toHaveBeenCalled(); });
    expect(localStorage.getItem("mnote:draft:d1")).toBeNull();
  });

  // FE-1: lifecycle no longer issues PUTs itself; it must hand the
  // snapshot to the queue via requestSave so single-flight semantics hold.
  it("auto-save calls requestSave when content changed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const opts = makeOpts();

    renderHook(() => useEditorLifecycle(opts));
    await vi.waitFor(() => { expect(opts.onLoaded).toHaveBeenCalled(); });

    opts.contentRef.current = "# Updated Title\nNew content";

    await vi.advanceTimersByTimeAsync(10100);
    expect(opts.requestSave).toHaveBeenCalledWith({
      title: "Updated Title",
      content: "# Updated Title\nNew content",
    });
    vi.useRealTimers();
  });

  it("auto-save skips when content unchanged", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const opts = makeOpts();
    opts.contentRef.current = "# Hello";
    opts.lastSavedContentRef.current = "# Hello";

    renderHook(() => useEditorLifecycle(opts));
    await vi.waitFor(() => { expect(opts.onLoaded).toHaveBeenCalled(); });

    await vi.advanceTimersByTimeAsync(10100);
    expect(opts.requestSave).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("auto-save skips when no title extracted", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const opts = makeOpts();
    opts.contentRef.current = "no heading";
    opts.lastSavedContentRef.current = "# Hello";

    renderHook(() => useEditorLifecycle(opts));
    await vi.waitFor(() => { expect(opts.onLoaded).toHaveBeenCalled(); });

    await vi.advanceTimersByTimeAsync(10100);
    expect(opts.requestSave).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("draft save removes draft when no unsaved changes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localStorage.setItem("mnote:draft:d1", JSON.stringify({ content: "old" }));
    const opts = makeOpts({ hasUnsavedChanges: false });

    renderHook(() => useEditorLifecycle(opts));
    await vi.waitFor(() => { expect(opts.onLoaded).toHaveBeenCalled(); });

    await vi.advanceTimersByTimeAsync(500);
    expect(localStorage.getItem("mnote:draft:d1")).toBeNull();
    vi.useRealTimers();
  });

  it("skips fetch when id is empty", () => {
    const opts = makeOpts({ id: "" });
    renderHook(() => useEditorLifecycle(opts));
    expect(opts.documentActions.getDocument).not.toHaveBeenCalled();
  });

  it("saves draft on unmount when hasUnsavedChanges", async () => {
    const opts = makeOpts({ hasUnsavedChanges: true });
    const { unmount } = renderHook(() => useEditorLifecycle(opts));
    await waitFor(() => { expect(opts.onLoaded).toHaveBeenCalled(); });
    opts.contentRef.current = "# Unsaved";
    unmount();
    const draft = localStorage.getItem("mnote:draft:d1");
    expect(draft).toBeTruthy();
    expect(JSON.parse(draft!).content).toBe("# Unsaved");
  });
});
