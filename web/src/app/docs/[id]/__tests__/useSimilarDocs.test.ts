import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { apiFetch } from "@/lib/api";
import { useSimilarDocs } from "../hooks/useSimilarDocs";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => { vi.clearAllMocks(); });

describe("useSimilarDocs", () => {
  it("shows the content-based entry point regardless of title length", () => {
    const { result } = renderHook(() => useSimilarDocs({ docId: "d1", title: "" }));
    expect(result.current.similarDocs).toEqual([]);
    expect(result.current.similarLoading).toBe(false);
    expect(result.current.similarCollapsed).toBe(true);
    expect(result.current.similarIconVisible).toBe(true);
  });

  it("shows icon when a document id is available", async () => {
    const { result } = renderHook(() => useSimilarDocs({ docId: "d1", title: "AB" }));
    await waitFor(() => { expect(result.current.similarIconVisible).toBe(true); });
  });

  it("does not hide icon for a short title", async () => {
    const { result } = renderHook(() => useSimilarDocs({ docId: "d1", title: "A" }));
    await waitFor(() => { expect(result.current.similarIconVisible).toBe(true); });
  });

  it("handleToggleSimilar expands and fetches", async () => {
    mockApiFetch.mockResolvedValue({ items: [{ id: "s1", title: "Similar1", score: 0.9 }] });
    const { result } = renderHook(() => useSimilarDocs({ docId: "d1", title: "Test Doc" }));
    await act(async () => { result.current.handleToggleSimilar(); });
    expect(result.current.similarCollapsed).toBe(false);
    await waitFor(() => { expect(result.current.similarDocs).toHaveLength(1); });
  });

  it("handleToggleSimilar collapses when already expanded", async () => {
    mockApiFetch.mockResolvedValue({ items: [] });
    const { result } = renderHook(() => useSimilarDocs({ docId: "d1", title: "Test Doc" }));
    await act(async () => { result.current.handleToggleSimilar(); });
    expect(result.current.similarCollapsed).toBe(false);
    act(() => { result.current.handleToggleSimilar(); });
    expect(result.current.similarCollapsed).toBe(true);
  });

  it("handleCollapseSimilar collapses", async () => {
    mockApiFetch.mockResolvedValue({ items: [] });
    const { result } = renderHook(() => useSimilarDocs({ docId: "d1", title: "Test" }));
    await act(async () => { result.current.handleToggleSimilar(); });
    act(() => { result.current.handleCollapseSimilar(); });
    expect(result.current.similarCollapsed).toBe(true);
  });

  it("handleCloseSimilar clears all state", async () => {
    mockApiFetch.mockResolvedValue({ items: [{ id: "s1", title: "S1", score: 0.8 }] });
    const { result } = renderHook(() => useSimilarDocs({ docId: "d1", title: "Test" }));
    await act(async () => { result.current.handleToggleSimilar(); });
    await waitFor(() => { expect(result.current.similarDocs).toHaveLength(1); });
    act(() => { result.current.handleCloseSimilar(); });
    expect(result.current.similarCollapsed).toBe(true);
    expect(result.current.similarDocs).toEqual([]);
  });

  it("fetchSimilar handles API error", async () => {
    mockApiFetch.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useSimilarDocs({ docId: "d1", title: "Test Doc" }));
    await act(async () => { result.current.handleToggleSimilar(); });
    await waitFor(() => { expect(result.current.similarLoading).toBe(false); });
    expect(result.current.similarDocs).toEqual([]);
  });

  it("toggle fetches only when expanding", async () => {
    mockApiFetch.mockResolvedValue({ items: [{ id: "s1", title: "S1", score: 0.5 }] });
    const { result } = renderHook(() => useSimilarDocs({ docId: "d1", title: "Test Doc" }));
    await act(async () => { result.current.handleToggleSimilar(); });
    await waitFor(() => { expect(result.current.similarDocs).toHaveLength(1); });
    mockApiFetch.mockClear();
    act(() => { result.current.handleToggleSimilar(); });
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("title changes do not toggle the content-based entry point", () => {
    const { result, rerender } = renderHook(
      ({ title }) => useSimilarDocs({ docId: "d1", title }),
      { initialProps: { title: "" } }
    );
    expect(result.current.similarIconVisible).toBe(true);
    rerender({ title: "Long enough title" });
    expect(result.current.similarIconVisible).toBe(true);
    rerender({ title: "X" });
    expect(result.current.similarIconVisible).toBe(true);
  });

  it("fetchSimilar sends docId in API call", async () => {
    mockApiFetch.mockResolvedValue({ items: [] });
    const { result } = renderHook(() => useSimilarDocs({ docId: "d1", title: "Test Doc" }));
    await act(async () => { result.current.handleToggleSimilar(); });
    expect(mockApiFetch).toHaveBeenCalledWith("/documents/d1/similar?limit=5", expect.anything());
  });

  it("fetches by document id even when the title is short", async () => {
    mockApiFetch.mockResolvedValue({ items: [{ id: "s1", title: "S1", score: 0.9 }] });
    const { result } = renderHook(() => useSimilarDocs({ docId: "d1", title: "A" }));
    await act(async () => { result.current.handleToggleSimilar(); });
    await waitFor(() => { expect(result.current.similarDocs).toHaveLength(1); });
    expect(mockApiFetch).toHaveBeenCalledOnce();
  });

  it("does not refetch when only the title changes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockApiFetch.mockResolvedValue({ items: [{ id: "s1", title: "S1", score: 0.8 }] });
    const { result, rerender } = renderHook(
      ({ title }) => useSimilarDocs({ docId: "d1", title }),
      { initialProps: { title: "Test Doc" } }
    );
    await act(async () => { result.current.handleToggleSimilar(); });
    await waitFor(() => { expect(result.current.similarDocs).toHaveLength(1); });
    mockApiFetch.mockClear();
    mockApiFetch.mockResolvedValue({ items: [{ id: "s2", title: "S2", score: 0.7 }] });
    rerender({ title: "Updated Title" });
    await act(async () => { await vi.advanceTimersByTimeAsync(1100); });
    expect(mockApiFetch).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("ignores AbortError without clearing docs", async () => {
    mockApiFetch.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
    const { result } = renderHook(() => useSimilarDocs({ docId: "d1", title: "Test Doc" }));
    await act(async () => { result.current.handleToggleSimilar(); });
    await waitFor(() => { expect(result.current.similarLoading).toBe(false); });
    expect(result.current.similarDocs).toEqual([]);
  });

  it("aborts previous fetch when called rapidly", async () => {
    let aborted = false;
    mockApiFetch.mockImplementationOnce(
      <T = unknown>(_url: string, opts?: Parameters<typeof apiFetch>[1]): Promise<T> =>
        new Promise<T>((_resolve, reject) => {
          opts?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    mockApiFetch.mockResolvedValueOnce({ items: [{ id: "s2", title: "S2", score: 0.8 }] });
    const { result } = renderHook(() => useSimilarDocs({ docId: "d1", title: "Test Doc" }));
    await act(async () => { result.current.handleToggleSimilar(); });
    await act(async () => { result.current.handleToggleSimilar(); });
    await act(async () => { result.current.handleToggleSimilar(); });
    await waitFor(() => { expect(aborted).toBe(true); });
  });

  it("aborts pending fetch on unmount", async () => {
    let aborted = false;
    mockApiFetch.mockImplementationOnce(
      <T = unknown>(_url: string, opts?: Parameters<typeof apiFetch>[1]): Promise<T> =>
        new Promise<T>((_resolve, reject) => {
          opts?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const { result, unmount } = renderHook(() => useSimilarDocs({ docId: "d1", title: "Test Doc" }));
    await act(async () => { result.current.handleToggleSimilar(); });
    unmount();
    await new Promise(r => setTimeout(r, 10));
    expect(aborted).toBe(true);
  });

  it("clears loading when the document changes during a pending fetch", async () => {
    let aborted = false;
    mockApiFetch.mockImplementationOnce(
      <T = unknown>(_url: string, opts?: Parameters<typeof apiFetch>[1]): Promise<T> =>
        new Promise<T>((_resolve, reject) => {
          opts?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const { result, rerender } = renderHook(
      ({ docId }) => useSimilarDocs({ docId, title: "Test Doc" }),
      { initialProps: { docId: "d1" } },
    );
    await act(async () => { result.current.handleToggleSimilar(); });
    expect(result.current.similarLoading).toBe(true);

    rerender({ docId: "d2" });

    await waitFor(() => { expect(aborted).toBe(true); });
    expect(result.current.similarLoading).toBe(false);
    expect(result.current.similarCollapsed).toBe(true);
    expect(result.current.similarDocs).toEqual([]);
  });
});
