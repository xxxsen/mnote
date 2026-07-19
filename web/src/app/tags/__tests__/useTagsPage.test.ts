import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api";
import { useTagsPage } from "../hooks/useTagsPage";

const mockApiFetch = vi.mocked(apiFetch);
const toast = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useTagsPage", () => {
  it("loads, paginates, and deduplicates tags", async () => {
    const first = Array.from({ length: 10 }, (_, index) => ({
      id: `tag-${index}`,
      name: `Tag ${index}`,
      count: index,
    }));
    mockApiFetch.mockResolvedValueOnce(first);
    const { result } = renderHook(() => useTagsPage(toast));
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    expect(result.current.tags).toHaveLength(10);
    expect(result.current.hasMore).toBe(true);

    mockApiFetch.mockResolvedValueOnce([
      { id: "tag-0", name: "Tag 0", count: 0 },
      { id: "tag-10", name: "Tag 10", count: 10 },
    ]);
    await act(async () => { result.current.loadMore(); });
    await waitFor(() => { expect(result.current.loadingMore).toBe(false); });
    expect(result.current.tags).toHaveLength(11);
  });

  it("debounces search for 250ms and resets the offset", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockApiFetch.mockResolvedValue([]);
    const { result } = renderHook(() => useTagsPage(toast));
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    mockApiFetch.mockClear();

    act(() => { result.current.setSearch("release"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(249); });
    expect(mockApiFetch).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining("q=release"),
        expect.anything(),
      );
    });
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining("offset=0"),
      expect.anything(),
    );
  });

  it("exposes retryable initial and incremental errors without replacing data", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderHook(() => useTagsPage(toast));
    await waitFor(() => { expect(result.current.initialError).toBe(true); });
    expect(toast).not.toHaveBeenCalled();

    mockApiFetch.mockResolvedValueOnce([
      { id: "tag-1", name: "One", count: 1 },
      ...Array.from({ length: 9 }, (_, index) => ({
        id: `tag-${index + 2}`,
        name: `Tag ${index + 2}`,
        count: 0,
      })),
    ]);
    await act(async () => { result.current.retryInitial(); });
    await waitFor(() => { expect(result.current.tags).toHaveLength(10); });

    mockApiFetch.mockRejectedValueOnce(new Error("offline"));
    await act(async () => { result.current.loadMore(); });
    await waitFor(() => { expect(result.current.loadMoreError).toBe(true); });
    expect(result.current.tags).toHaveLength(10);
  });

  it("deletes once, updates local state, and reports success", async () => {
    mockApiFetch.mockResolvedValueOnce([{ id: "tag-1", name: "One", count: 2 }]);
    const { result } = renderHook(() => useTagsPage(toast));
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    mockApiFetch.mockResolvedValueOnce({});

    act(() => { result.current.requestDelete(result.current.tags[0]); });
    await act(async () => { await result.current.confirmDelete(); });

    expect(result.current.tags).toEqual([]);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "success" }));
  });

  it("keeps the confirmation and exposes a recoverable delete error", async () => {
    mockApiFetch.mockResolvedValueOnce([{ id: "tag-1", name: "One", count: 2 }]);
    const { result } = renderHook(() => useTagsPage(toast));
    await waitFor(() => { expect(result.current.loading).toBe(false); });
    mockApiFetch.mockRejectedValueOnce(new Error("conflict"));

    act(() => { result.current.requestDelete(result.current.tags[0]); });
    await act(async () => { await result.current.confirmDelete(); });

    expect(result.current.deleteTarget?.id).toBe("tag-1");
    expect(result.current.deleteError).toContain("could not be deleted");
  });
});
