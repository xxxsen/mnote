import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

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

const makeOpts = (overrides = {}) => {
  const contentRef = { current: "" };
  const lastSavedContentRef = { current: "" };
  return {
    id: "d1",
    saving: false,
    hasUnsavedChanges: false,
    contentRef,
    lastSavedContentRef,
    documentActions: {
      getDocument: vi.fn().mockResolvedValue(makeDocDetail()),
      saveDocument: vi.fn().mockResolvedValue(undefined),
    },
    extractTitleFromContent: (v: string) => {
      const match = v.match(/^#\s+(.+)/m);
      return match ? match[1].trim() : "";
    },
    onLoadingChange: vi.fn(),
    onLoaded: vi.fn(),
    onLoadError: vi.fn(),
    onAutoSaved: vi.fn(),
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
        saveDocument: vi.fn(),
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

  it("cleans invalid draft from localStorage", async () => {
    localStorage.setItem("mnote:draft:d1", "not-json{{{");
    const opts = makeOpts();
    renderHook(() => useEditorLifecycle(opts));
    await waitFor(() => { expect(opts.onLoaded).toHaveBeenCalled(); });
    expect(localStorage.getItem("mnote:draft:d1")).toBeNull();
  });
});
