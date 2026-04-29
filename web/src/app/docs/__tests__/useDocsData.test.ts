import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api";
import { useDocsData } from "../hooks/useDocsData";

const mockApiFetch = vi.mocked(apiFetch);

const makeDeps = (overrides = {}) => ({
  search: "", selectedTag: "", showStarred: false, showShared: false,
  mergeTags: vi.fn(), fetchTagsByIDs: vi.fn().mockResolvedValue(undefined),
  tagIndexRef: { current: {} },
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => { vi.useRealTimers(); });

describe("useDocsData", () => {
  it("auto-fetches docs on mount", async () => {
    mockApiFetch.mockResolvedValue([]);
    const { result } = renderHook(() => useDocsData(makeDeps()));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(result.current.loading).toBe(false);
  });

  it("fetches shared items when showShared", async () => {
    mockApiFetch.mockResolvedValue({ items: [{ id: "s1", title: "Shared", mtime: 100, token: "tok" }] });
    const deps = makeDeps({ showShared: true });
    const { result } = renderHook(() => useDocsData(deps));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(result.current.docs).toHaveLength(1);
    expect(result.current.docs[0].share_token).toBe("tok");
  });

  it("fetches with search query", async () => {
    mockApiFetch.mockResolvedValue([]);
    renderHook(() => useDocsData(makeDeps({ search: "test" })));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining("q=test"));
  });

  it("fetches with starred filter", async () => {
    mockApiFetch.mockResolvedValue([]);
    renderHook(() => useDocsData(makeDeps({ showStarred: true })));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining("starred=1"));
  });

  it("fetches with tag filter", async () => {
    mockApiFetch.mockResolvedValue([]);
    renderHook(() => useDocsData(makeDeps({ selectedTag: "t1" })));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining("tag_id=t1"));
  });

  it("fetchSummary gets doc summary", async () => {
    mockApiFetch.mockResolvedValue({ recent: [], tag_counts: {}, total: 10, starred_total: 3 });
    const { result } = renderHook(() => useDocsData(makeDeps()));
    await act(async () => { await result.current.fetchSummary(); });
    expect(result.current.totalDocs).toBe(10);
    expect(result.current.starredTotal).toBe(3);
  });

  it("fetchSummary handles errors", async () => {
    mockApiFetch.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useDocsData(makeDeps()));
    await act(async () => { await result.current.fetchSummary(); });
    expect(result.current.totalDocs).toBe(0);
  });

  it("fetchSharedSummary counts shared items", async () => {
    mockApiFetch.mockResolvedValue({ items: [{ id: "1" }, { id: "2" }] });
    const { result } = renderHook(() => useDocsData(makeDeps()));
    await act(async () => { await result.current.fetchSharedSummary(); });
    expect(result.current.sharedTotal).toBe(2);
  });

  it("handlePinToggle pins document", async () => {
    mockApiFetch.mockResolvedValue([{ id: "d1", title: "T", pinned: 0, starred: 0, tags: [], tag_ids: [] }]);
    const { result } = renderHook(() => useDocsData(makeDeps()));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    mockApiFetch.mockResolvedValue(undefined);
    await act(async () => {
      await result.current.handlePinToggle({ stopPropagation: vi.fn() } as never, { id: "d1", pinned: 0 } as never);
    });
    expect(mockApiFetch).toHaveBeenCalledWith("/documents/d1/pin", expect.objectContaining({ method: "PUT" }));
  });

  it("handleStarToggle stars document", async () => {
    mockApiFetch.mockResolvedValue([{ id: "d1", title: "T", starred: 0, tags: [], tag_ids: [] }]);
    const { result } = renderHook(() => useDocsData(makeDeps()));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    mockApiFetch.mockResolvedValue(undefined);
    await act(async () => {
      await result.current.handleStarToggle({ stopPropagation: vi.fn() } as never, { id: "d1", starred: 0 } as never);
    });
    expect(mockApiFetch).toHaveBeenCalledWith("/documents/d1/star", expect.objectContaining({ method: "PUT" }));
  });

  it("fetchAiSearch fetches AI results", async () => {
    mockApiFetch.mockResolvedValue({ items: [{ id: "a1", title: "AI result" }] });
    const { result } = renderHook(() => useDocsData(makeDeps()));
    await act(async () => { await result.current.fetchAiSearch("query"); });
    expect(result.current.aiSearchDocs).toHaveLength(1);
  });

  it("fetchAiSearch clears for empty query", async () => {
    const { result } = renderHook(() => useDocsData(makeDeps()));
    await act(async () => { await result.current.fetchAiSearch(""); });
    expect(result.current.aiSearchDocs).toEqual([]);
  });

  it("fetchAiSearch handles errors", async () => {
    mockApiFetch.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useDocsData(makeDeps()));
    await act(async () => { await result.current.fetchAiSearch("test"); });
    expect(result.current.aiSearchDocs).toEqual([]);
  });

  it("merges tags from fetched docs", async () => {
    const mt = vi.fn();
    mockApiFetch.mockResolvedValue([{ id: "d1", tags: [{ id: "t1", name: "go" }], tag_ids: ["t1"] }]);
    renderHook(() => useDocsData(makeDeps({ mergeTags: mt })));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(mt).toHaveBeenCalled();
  });

  it("hasMore is false when fewer than 20 results", async () => {
    mockApiFetch.mockResolvedValue([{ id: "d1", title: "T", tags: [], tag_ids: [] }]);
    const { result } = renderHook(() => useDocsData(makeDeps()));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(result.current.hasMore).toBe(false);
  });

  it("fetchDocs handles error gracefully", async () => {
    mockApiFetch.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useDocsData(makeDeps()));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(result.current.docs).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("fetchSharedSummary handles error", async () => {
    mockApiFetch.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useDocsData(makeDeps()));
    await act(async () => { await result.current.fetchSharedSummary(); });
    expect(result.current.sharedTotal).toBe(0);
  });

  it("handlePinToggle handles error", async () => {
    mockApiFetch.mockResolvedValue([{ id: "d1", title: "T", pinned: 0, starred: 0, tags: [], tag_ids: [] }]);
    const { result } = renderHook(() => useDocsData(makeDeps()));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    mockApiFetch.mockRejectedValue(new Error("fail"));
    await act(async () => {
      await result.current.handlePinToggle({ stopPropagation: vi.fn() } as never, { id: "d1", pinned: 0 } as never);
    });
  });

  it("handleStarToggle handles error", async () => {
    mockApiFetch.mockResolvedValue([{ id: "d1", title: "T", starred: 0, tags: [], tag_ids: [] }]);
    const { result } = renderHook(() => useDocsData(makeDeps()));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    mockApiFetch.mockRejectedValue(new Error("fail"));
    await act(async () => {
      await result.current.handleStarToggle({ stopPropagation: vi.fn() } as never, { id: "d1", starred: 0 } as never);
    });
  });

  it("shared items trigger fetchTagsByIDs for tag_ids", async () => {
    const fetchTagsByIDs = vi.fn().mockResolvedValue(undefined);
    mockApiFetch.mockResolvedValue({ items: [{ id: "s1", title: "S", mtime: 100, token: "tk", tag_ids: ["t1"] }] });
    renderHook(() => useDocsData(makeDeps({ showShared: true, fetchTagsByIDs })));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(fetchTagsByIDs).toHaveBeenCalledWith(["t1"]);
  });

  it("fetchDocs with missing tag_ids calls fetchTagsByIDs", async () => {
    const fetchTagsByIDs = vi.fn().mockResolvedValue(undefined);
    mockApiFetch.mockResolvedValue([{ id: "d1", title: "T", tags: [], tag_ids: ["t1", "t2"] }]);
    renderHook(() => useDocsData(makeDeps({ fetchTagsByIDs })));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(fetchTagsByIDs).toHaveBeenCalledWith(expect.arrayContaining(["t1", "t2"]));
  });

  it("search triggers aiSearch for non-command queries", async () => {
    mockApiFetch.mockImplementation(((url: string) => {
      if (url.startsWith("/ai/search")) return Promise.resolve({ items: [{ id: "a1" }] });
      return Promise.resolve([]);
    }));
    const { result } = renderHook(() => useDocsData(makeDeps({ search: "hello" })));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(result.current.aiSearchDocs).toHaveLength(1);
  });

  it("search starting with / does not trigger aiSearch", async () => {
    mockApiFetch.mockResolvedValue([]);
    const { result } = renderHook(() => useDocsData(makeDeps({ search: "/command" })));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(result.current.aiSearchDocs).toEqual([]);
  });

  it("fetchDocs append deduplicates existing docs", async () => {
    const docs20 = Array.from({ length: 20 }, (_, i) => ({ id: `d${i}`, title: `T${i}`, tags: [], tag_ids: [], pinned: 0, starred: 0 }));
    mockApiFetch.mockResolvedValue(docs20);
    const { result } = renderHook(() => useDocsData(makeDeps()));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(result.current.docs).toHaveLength(20);
    expect(result.current.hasMore).toBe(true);

    const overlap = [{ id: "d0", title: "T0", tags: [], tag_ids: [] }, { id: "d20", title: "T20", tags: [], tag_ids: [] }];
    mockApiFetch.mockResolvedValue(overlap);
    await act(async () => { await result.current.fetchDocs(20, true); });
    expect(result.current.docs).toHaveLength(21);
  });

  it("IntersectionObserver is set up with loadMoreRef", async () => {
    const observeSpy = vi.fn();
    const disconnectSpy = vi.fn();
    vi.stubGlobal("IntersectionObserver", vi.fn().mockImplementation((cb: IntersectionObserverCallback) => {
      setTimeout(() => cb([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver), 0);
      return { observe: observeSpy, disconnect: disconnectSpy };
    }));
    const docs20 = Array.from({ length: 20 }, (_, i) => ({ id: `d${i}`, title: `T${i}`, tags: [], tag_ids: [], pinned: 0, starred: 0 }));
    mockApiFetch.mockResolvedValue(docs20);
    const { result } = renderHook(() => useDocsData(makeDeps()));
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    const div = document.createElement("div");
    (result.current.loadMoreRef).current = div;
    vi.unstubAllGlobals();
  });
});
