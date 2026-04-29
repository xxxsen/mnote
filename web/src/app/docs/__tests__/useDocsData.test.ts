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
});
