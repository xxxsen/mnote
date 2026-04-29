import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "@/lib/api";
import { useTagIndex } from "../hooks/useTagIndex";
import { useSavedViews } from "../hooks/useSavedViews";
import { useSidebarTags } from "../hooks/useSidebarTags";

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => { vi.useRealTimers(); });

describe("useTagIndex", () => {
  it("starts with empty tag index", () => {
    const { result } = renderHook(() => useTagIndex());
    expect(result.current.tagIndex).toEqual({});
  });

  it("mergeTags adds tags to index", () => {
    const { result } = renderHook(() => useTagIndex());
    act(() => { result.current.mergeTags([{ id: "t1", name: "go" } as never]); });
    expect(result.current.tagIndex["t1"]).toEqual({ id: "t1", name: "go" });
  });

  it("mergeTags ignores empty array", () => {
    const { result } = renderHook(() => useTagIndex());
    act(() => { result.current.mergeTags([]); });
    expect(result.current.tagIndex).toEqual({});
  });

  it("fetchTagsByIDs fetches and merges", async () => {
    mockApiFetch.mockResolvedValue([{ id: "t1", name: "go" }]);
    const { result } = renderHook(() => useTagIndex());
    await act(async () => { await result.current.fetchTagsByIDs(["t1"]); });
    expect(result.current.tagIndex["t1"]).toBeDefined();
  });

  it("fetchTagsByIDs skips empty array", async () => {
    const { result } = renderHook(() => useTagIndex());
    await act(async () => { await result.current.fetchTagsByIDs([]); });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("fetchTagsByIDs handles errors", async () => {
    mockApiFetch.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useTagIndex());
    await act(async () => { await result.current.fetchTagsByIDs(["t1"]); });
    expect(result.current.tagIndex).toEqual({});
  });

  it("fetchTags fetches with query", async () => {
    mockApiFetch.mockResolvedValue([{ id: "t2", name: "react" }]);
    const { result } = renderHook(() => useTagIndex());
    await act(async () => { await result.current.fetchTags("react"); });
    expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining("q=react"));
  });

  it("fetchTags without query fetches all", async () => {
    mockApiFetch.mockResolvedValue([]);
    const { result } = renderHook(() => useTagIndex());
    await act(async () => { await result.current.fetchTags(""); });
    expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining("limit=20"));
  });

  it("fetchTags handles errors", async () => {
    mockApiFetch.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useTagIndex());
    await act(async () => { await result.current.fetchTags("x"); });
    expect(result.current.tagIndex).toEqual({});
  });

  it("fetchTags skips if already in flight", async () => {
    let resolveFirst: (() => void) | null = null;
    mockApiFetch.mockImplementation(() => new Promise<never[]>((r) => { resolveFirst = () => r([]); }));
    const { result } = renderHook(() => useTagIndex());
    const p1 = act(async () => { void result.current.fetchTags("a"); });
    await act(async () => { void result.current.fetchTags("b"); });
    if (resolveFirst) resolveFirst();
    await p1;
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });
});

describe("useSavedViews", () => {
  const toastFn = vi.fn();

  it("starts with empty saved views", () => {
    const { result } = renderHook(() => useSavedViews({ toast: toastFn }));
    expect(result.current.savedViews).toEqual([]);
  });

  it("fetchSavedViews fetches and maps data", async () => {
    mockApiFetch.mockResolvedValue([
      { id: "v1", name: "View1", search: "go", tag_id: "t1", show_starred: 1, show_shared: 0 },
    ]);
    const { result } = renderHook(() => useSavedViews({ toast: toastFn }));
    await act(async () => { await result.current.fetchSavedViews(); });
    expect(result.current.savedViews).toEqual([{
      id: "v1", name: "View1", search: "go", selectedTag: "t1",
      showStarred: true, showShared: false,
    }]);
  });

  it("fetchSavedViews handles errors", async () => {
    mockApiFetch.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useSavedViews({ toast: toastFn }));
    await act(async () => { await result.current.fetchSavedViews(); });
    expect(result.current.savedViews).toEqual([]);
  });

  it("handleSaveCurrentView requires a filter", async () => {
    const { result } = renderHook(() => useSavedViews({ toast: toastFn }));
    await act(async () => {
      await result.current.handleSaveCurrentView({ search: "", selectedTag: "", showStarred: false, showShared: false });
    });
    expect(toastFn).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("filter") }));
  });

  it("handleSaveCurrentView creates view", async () => {
    vi.stubGlobal("prompt", vi.fn().mockReturnValue("My View"));
    mockApiFetch.mockResolvedValue({ id: "v1" });
    const { result } = renderHook(() => useSavedViews({ toast: toastFn }));
    await act(async () => {
      await result.current.handleSaveCurrentView({ search: "go", selectedTag: "", showStarred: false, showShared: false });
    });
    expect(mockApiFetch).toHaveBeenCalledWith("/saved-views", expect.objectContaining({ method: "POST" }));
  });

  it("handleSaveCurrentView aborts when prompt returns empty", async () => {
    vi.stubGlobal("prompt", vi.fn().mockReturnValue(""));
    const { result } = renderHook(() => useSavedViews({ toast: toastFn }));
    await act(async () => {
      await result.current.handleSaveCurrentView({ search: "go", selectedTag: "", showStarred: false, showShared: false });
    });
    expect(mockApiFetch).not.toHaveBeenCalledWith("/saved-views", expect.anything());
  });

  it("removeSavedView deletes and refreshes", async () => {
    mockApiFetch.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSavedViews({ toast: toastFn }));
    await act(async () => { await result.current.removeSavedView("v1"); });
    expect(mockApiFetch).toHaveBeenCalledWith("/saved-views/v1", { method: "DELETE" });
  });

  it("handleSaveCurrentView handles API error", async () => {
    vi.stubGlobal("prompt", vi.fn().mockReturnValue("My View"));
    mockApiFetch.mockRejectedValue(new Error("save fail"));
    const { result } = renderHook(() => useSavedViews({ toast: toastFn }));
    await act(async () => {
      await result.current.handleSaveCurrentView({ search: "go", selectedTag: "", showStarred: false, showShared: false });
    });
    expect(toastFn).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
    vi.unstubAllGlobals();
  });

  it("removeSavedView toasts on error", async () => {
    mockApiFetch.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useSavedViews({ toast: toastFn }));
    await act(async () => { await result.current.removeSavedView("v1"); });
    expect(toastFn).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });
});

describe("useSidebarTags", () => {
  const toastFn = vi.fn();

  it("starts with empty state", () => {
    const { result } = renderHook(() => useSidebarTags({ toast: toastFn }));
    expect(result.current.sidebarTags).toEqual([]);
    expect(result.current.sidebarLoading).toBe(false);
  });

  it("auto-fetches on mount with debounce", async () => {
    mockApiFetch.mockResolvedValue([{ id: "t1", name: "go", doc_count: 5 }]);
    const { result } = renderHook(() => useSidebarTags({ toast: toastFn }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(result.current.sidebarTags).toHaveLength(1);
  });

  it("fetches again when tagSearch changes", async () => {
    mockApiFetch.mockResolvedValue([]);
    const { result } = renderHook(() => useSidebarTags({ toast: toastFn }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    act(() => { result.current.setTagSearch("go"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining("q=go"));
  });

  it("handleToggleTagPin pins/unpins tag", async () => {
    mockApiFetch.mockResolvedValue([]);
    const { result } = renderHook(() => useSidebarTags({ toast: toastFn }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    await act(async () => {
      await result.current.handleToggleTagPin({ id: "t1", pinned: 0 } as never);
    });
    expect(mockApiFetch).toHaveBeenCalledWith("/tags/t1/pin", expect.objectContaining({ method: "PUT" }));
  });

  it("handleToggleTagPin toasts on error", async () => {
    mockApiFetch.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useSidebarTags({ toast: toastFn }));
    await act(async () => {
      await result.current.handleToggleTagPin({ id: "t1", pinned: 0 } as never);
    });
    expect(toastFn).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });

  it("maybeAutoLoadTags does nothing when loading", () => {
    const { result } = renderHook(() => useSidebarTags({ toast: toastFn }));
    expect(() => result.current.maybeAutoLoadTags()).not.toThrow();
  });
});
