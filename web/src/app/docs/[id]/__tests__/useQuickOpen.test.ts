import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { apiFetch } from "@/lib/api";
import { useQuickOpen } from "../hooks/useQuickOpen";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);
const stableOnSelect = vi.fn();

beforeEach(() => { vi.clearAllMocks(); });

describe("useQuickOpen", () => {
  it("initializes closed", () => {
    const { result } = renderHook(() => useQuickOpen({ onSelectDocument: stableOnSelect }));
    expect(result.current.showQuickOpen).toBe(false);
    expect(result.current.quickOpenQuery).toBe("");
    expect(result.current.quickOpenIndex).toBe(0);
  });

  it("handleOpenQuickOpen opens and fetches recent docs", async () => {
    mockApiFetch.mockResolvedValue([{ id: "d1", title: "Recent" }]);
    const { result } = renderHook(() => useQuickOpen({ onSelectDocument: stableOnSelect }));
    act(() => { result.current.handleOpenQuickOpen(); });
    expect(result.current.showQuickOpen).toBe(true);
    await waitFor(() => { expect(result.current.quickOpenRecent).toHaveLength(1); });
  });

  it("handleCloseQuickOpen closes", () => {
    const { result } = renderHook(() => useQuickOpen({ onSelectDocument: stableOnSelect }));
    act(() => { result.current.handleOpenQuickOpen(); });
    act(() => { result.current.handleCloseQuickOpen(); });
    expect(result.current.showQuickOpen).toBe(false);
  });

  it("handleQuickOpenSelect calls onSelectDocument and closes", async () => {
    mockApiFetch.mockResolvedValue([]);
    const { result } = renderHook(() => useQuickOpen({ onSelectDocument: stableOnSelect }));
    const doc = { id: "d1", title: "Doc" } as never;
    act(() => { result.current.handleOpenQuickOpen(); });
    act(() => { result.current.handleQuickOpenSelect(doc); });
    expect(stableOnSelect).toHaveBeenCalledWith(doc);
    expect(result.current.showQuickOpen).toBe(false);
  });

  it("search query triggers search", async () => {
    mockApiFetch.mockResolvedValue([{ id: "s1", title: "Search Result" }]);
    const { result } = renderHook(() => useQuickOpen({ onSelectDocument: stableOnSelect }));
    act(() => { result.current.handleOpenQuickOpen(); });
    act(() => { result.current.setQuickOpenQuery("test"); });
    await waitFor(() => { expect(result.current.quickOpenResults).toHaveLength(1); });
    expect(result.current.showSearchResults).toBe(true);
  });

  it("Ctrl+K opens quick open", () => {
    mockApiFetch.mockResolvedValue([]);
    const { result } = renderHook(() => useQuickOpen({ onSelectDocument: stableOnSelect }));
    act(() => {
      const event = new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true });
      window.dispatchEvent(event);
    });
    expect(result.current.showQuickOpen).toBe(true);
  });

  it("empty query shows recent docs", async () => {
    const recent = [{ id: "r1", title: "Recent1" }];
    mockApiFetch.mockResolvedValue(recent);
    const { result } = renderHook(() => useQuickOpen({ onSelectDocument: stableOnSelect }));
    act(() => { result.current.handleOpenQuickOpen(); });
    await waitFor(() => { expect(result.current.quickOpenDocs).toEqual(recent); });
  });

  it("fetchRecentDocs handles error", async () => {
    mockApiFetch.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useQuickOpen({ onSelectDocument: stableOnSelect }));
    act(() => { result.current.handleOpenQuickOpen(); });
    await waitFor(() => { expect(result.current.quickOpenRecent).toEqual([]); });
  });

  it("resets quickOpenIndex when exceeding docs length", async () => {
    mockApiFetch.mockResolvedValue([{ id: "d1", title: "Doc1" }]);
    const { result } = renderHook(() => useQuickOpen({ onSelectDocument: stableOnSelect }));
    act(() => { result.current.handleOpenQuickOpen(); });
    await waitFor(() => { expect(result.current.quickOpenRecent).toHaveLength(1); });
    act(() => { result.current.setQuickOpenIndex(5); });
    await waitFor(() => { expect(result.current.quickOpenIndex).toBe(0); });
  });

  it("fetchQuickOpenSearch handles error", async () => {
    mockApiFetch.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useQuickOpen({ onSelectDocument: stableOnSelect }));
    act(() => { result.current.handleOpenQuickOpen(); });
    await waitFor(() => { expect(result.current.showQuickOpen).toBe(true); });
    mockApiFetch.mockRejectedValue(new Error("search fail"));
    act(() => { result.current.setQuickOpenQuery("fail"); });
    await waitFor(() => { expect(result.current.quickOpenResults).toEqual([]); });
  });

  it("Meta+K opens quick open", () => {
    mockApiFetch.mockResolvedValue([]);
    const { result } = renderHook(() => useQuickOpen({ onSelectDocument: stableOnSelect }));
    act(() => {
      const event = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true });
      window.dispatchEvent(event);
    });
    expect(result.current.showQuickOpen).toBe(true);
  });
});
