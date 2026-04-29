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
  it("initializes with empty state when title is short", () => {
    const { result } = renderHook(() => useSimilarDocs({ docId: "d1", title: "" }));
    expect(result.current.similarDocs).toEqual([]);
    expect(result.current.similarLoading).toBe(false);
    expect(result.current.similarCollapsed).toBe(true);
    expect(result.current.similarIconVisible).toBe(false);
  });

  it("shows icon when title has >= 2 chars", async () => {
    const { result } = renderHook(() => useSimilarDocs({ docId: "d1", title: "AB" }));
    await waitFor(() => { expect(result.current.similarIconVisible).toBe(true); });
  });

  it("hides icon when title has < 2 chars", async () => {
    const { result } = renderHook(() => useSimilarDocs({ docId: "d1", title: "A" }));
    await waitFor(() => { expect(result.current.similarIconVisible).toBe(false); });
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
});
