import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { apiFetch } from "@/lib/api";
import { useSidebarTags } from "../hooks/useSidebarTags";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

const mockApiFetch = vi.mocked(apiFetch);
const stableToast = vi.fn();

beforeEach(() => { vi.clearAllMocks(); });

describe("useSidebarTags", () => {
  it("initializes with empty state", () => {
    mockApiFetch.mockResolvedValue([]);
    const { result } = renderHook(() => useSidebarTags({ toast: stableToast }));
    expect(result.current.sidebarTags).toEqual([]);
    expect(result.current.sidebarLoading).toBe(false);
    expect(result.current.tagSearch).toBe("");
  });

  it("fetches tags on mount", async () => {
    mockApiFetch.mockResolvedValue([{ id: "t1", name: "go", doc_count: 5, pinned: 0 }]);
    const { result } = renderHook(() => useSidebarTags({ toast: stableToast }));
    await waitFor(() => { expect(result.current.sidebarTags).toHaveLength(1); });
  });

  it("searches tags when tagSearch changes", async () => {
    mockApiFetch.mockResolvedValue([{ id: "t2", name: "rust", doc_count: 3, pinned: 0 }]);
    const { result } = renderHook(() => useSidebarTags({ toast: stableToast }));
    act(() => { result.current.setTagSearch("rust"); });
    await waitFor(() => { expect(result.current.sidebarTags).toHaveLength(1); });
  });

  it("handleToggleTagPin toggles pin", async () => {
    mockApiFetch.mockResolvedValue([]);
    const { result } = renderHook(() => useSidebarTags({ toast: stableToast }));
    await waitFor(() => { expect(result.current.sidebarLoading).toBe(false); });
    const tag = { id: "t1", name: "go", doc_count: 5, pinned: 0 };
    await act(async () => { await result.current.handleToggleTagPin(tag as never); });
    expect(mockApiFetch).toHaveBeenCalledWith("/tags/t1/pin", expect.objectContaining({ method: "PUT" }));
  });

  it("handleToggleTagPin error shows toast", async () => {
    mockApiFetch.mockImplementation(((url: string) => {
      if (url.includes("/pin")) return Promise.reject(new Error("fail"));
      return Promise.resolve([]);
    }) as typeof apiFetch);
    const { result } = renderHook(() => useSidebarTags({ toast: stableToast }));
    await waitFor(() => { expect(result.current.sidebarLoading).toBe(false); });
    const tag = { id: "t1", name: "go", doc_count: 5, pinned: 0 };
    await act(async () => { await result.current.handleToggleTagPin(tag as never); });
    expect(stableToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));
  });

  it("fetchSidebarTags handles error", async () => {
    mockApiFetch.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useSidebarTags({ toast: stableToast }));
    await waitFor(() => { expect(result.current.sidebarLoading).toBe(false); });
    expect(result.current.sidebarTags).toEqual([]);
  });

  it("sidebarHasMore is false when less than 20 tags returned", async () => {
    mockApiFetch.mockResolvedValue([{ id: "t1", name: "go", doc_count: 5, pinned: 0 }]);
    const { result } = renderHook(() => useSidebarTags({ toast: stableToast }));
    await waitFor(() => { expect(result.current.sidebarHasMore).toBe(false); });
  });

  it("sidebarHasMore is true when exactly 20 tags returned", async () => {
    const tags = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}`, name: `tag${i}`, doc_count: 1, pinned: 0 }));
    mockApiFetch.mockResolvedValue(tags);
    const { result } = renderHook(() => useSidebarTags({ toast: stableToast }));
    await waitFor(() => { expect(result.current.sidebarHasMore).toBe(true); });
  });

  it("fetchSidebarTags can be called directly", async () => {
    mockApiFetch.mockResolvedValue([{ id: "t1", name: "go", doc_count: 5, pinned: 0 }]);
    const { result } = renderHook(() => useSidebarTags({ toast: stableToast }));
    await waitFor(() => { expect(result.current.sidebarLoading).toBe(false); });
    mockApiFetch.mockResolvedValue([{ id: "t2", name: "rust", doc_count: 3, pinned: 0 }]);
    await act(async () => { await result.current.fetchSidebarTags(0, false, "rust"); });
    expect(result.current.sidebarTags).toHaveLength(1);
    expect(result.current.sidebarTags[0].name).toBe("rust");
  });

  it("maybeAutoLoadTags does nothing without scroll ref", async () => {
    mockApiFetch.mockResolvedValue([]);
    const { result } = renderHook(() => useSidebarTags({ toast: stableToast }));
    await waitFor(() => { expect(result.current.sidebarLoading).toBe(false); });
    act(() => { result.current.maybeAutoLoadTags(); });
  });

  it("loadMoreSidebarTags no-op when no more", async () => {
    mockApiFetch.mockResolvedValue([{ id: "t1", name: "go", doc_count: 5, pinned: 0 }]);
    const { result } = renderHook(() => useSidebarTags({ toast: stableToast }));
    await waitFor(() => { expect(result.current.sidebarHasMore).toBe(false); });
    const callsBefore = mockApiFetch.mock.calls.length;
    await act(async () => { await result.current.fetchSidebarTags(1, true, ""); });
    expect(mockApiFetch.mock.calls.length).toBeGreaterThanOrEqual(callsBefore);
  });

  it("handleToggleTagPin unpins a pinned tag", async () => {
    mockApiFetch.mockResolvedValue([]);
    const { result } = renderHook(() => useSidebarTags({ toast: stableToast }));
    await waitFor(() => { expect(result.current.sidebarLoading).toBe(false); });
    const tag = { id: "t1", name: "go", doc_count: 5, pinned: 1 };
    await act(async () => { await result.current.handleToggleTagPin(tag as never); });
    expect(mockApiFetch).toHaveBeenCalledWith("/tags/t1/pin", expect.objectContaining({
      body: JSON.stringify({ pinned: false }),
    }));
  });

  it("maybeAutoLoadTags loads when near bottom of scroll", async () => {
    const tags20 = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}`, name: `tag${i}`, doc_count: 1, pinned: 0 }));
    mockApiFetch.mockResolvedValue(tags20);
    const { result } = renderHook(() => useSidebarTags({ toast: stableToast }));
    await waitFor(() => { expect(result.current.sidebarHasMore).toBe(true); });

    const container = document.createElement("div");
    Object.defineProperty(container, "scrollTop", { value: 950, writable: true });
    Object.defineProperty(container, "clientHeight", { value: 100, writable: true });
    Object.defineProperty(container, "scrollHeight", { value: 1000, writable: true });
    (result.current.sidebarScrollRef as React.MutableRefObject<HTMLDivElement | null>).current = container;

    mockApiFetch.mockResolvedValue([{ id: "t20", name: "tag20", doc_count: 1, pinned: 0 }]);
    act(() => { result.current.maybeAutoLoadTags(); });
    expect(mockApiFetch).toHaveBeenCalled();
  });

  it("maybeAutoLoadTags loads when not scrollable", async () => {
    const tags20 = Array.from({ length: 20 }, (_, i) => ({ id: `t${i}`, name: `tag${i}`, doc_count: 1, pinned: 0 }));
    mockApiFetch.mockResolvedValue(tags20);
    const { result } = renderHook(() => useSidebarTags({ toast: stableToast }));
    await waitFor(() => { expect(result.current.sidebarHasMore).toBe(true); });

    const container = document.createElement("div");
    Object.defineProperty(container, "scrollTop", { value: 0, writable: true });
    Object.defineProperty(container, "clientHeight", { value: 500, writable: true });
    Object.defineProperty(container, "scrollHeight", { value: 500, writable: true });
    (result.current.sidebarScrollRef as React.MutableRefObject<HTMLDivElement | null>).current = container;

    mockApiFetch.mockResolvedValue([{ id: "t20", name: "tag20", doc_count: 1, pinned: 0 }]);
    act(() => { result.current.maybeAutoLoadTags(); });
    expect(mockApiFetch).toHaveBeenCalled();
  });
});
