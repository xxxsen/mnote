import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api";
import { useHoverPreview } from "../hooks/use-hover-preview";

const mockApiFetch = vi.mocked(apiFetch);

const makeEvent = (left = 100, top = 100) => ({
  currentTarget: {
    getBoundingClientRect: () => ({ left, top, right: left + 100, bottom: top + 20, width: 100, height: 20, x: left, y: top, toJSON: vi.fn() }),
  },
}) as unknown as React.MouseEvent<HTMLAnchorElement>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => { vi.useRealTimers(); });

describe("useHoverPreview", () => {
  it("initializes with closed state", () => {
    const { result } = renderHook(() => useHoverPreview(true));
    expect(result.current.hoverPreview.open).toBe(false);
    expect(result.current.hoverPreview.loading).toBe(false);
  });

  it("does nothing when disabled", () => {
    const { result } = renderHook(() => useHoverPreview(false));
    act(() => { result.current.openHoverPreview(makeEvent(), "Test"); });
    expect(result.current.hoverPreview.open).toBe(false);
  });

  it("opens preview with loading state", () => {
    mockApiFetch.mockResolvedValue([{ id: "d1", title: "Test" }]);
    const { result } = renderHook(() => useHoverPreview(true));
    act(() => { result.current.openHoverPreview(makeEvent(), "Test"); });
    expect(result.current.hoverPreview.open).toBe(true);
    expect(result.current.hoverPreview.loading).toBe(true);
  });

  it("fetches and shows preview content", async () => {
    mockApiFetch
      .mockResolvedValueOnce([{ id: "d1", title: "Test" }])
      .mockResolvedValueOnce({ document: { title: "Test", content: "Hello world content", summary: "" } });
    const { result } = renderHook(() => useHoverPreview(true));
    act(() => { result.current.openHoverPreview(makeEvent(), "Test"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(result.current.hoverPreview.loading).toBe(false);
    expect(result.current.hoverPreview.content).toContain("Hello world content");
  });

  it("resolves by href when /docs/ path provided", async () => {
    mockApiFetch.mockResolvedValue({ document: { title: "Doc", content: "Content here", summary: "" } });
    const { result } = renderHook(() => useHoverPreview(true));
    act(() => { result.current.openHoverPreview(makeEvent(), "Doc", "/docs/d123"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(mockApiFetch).toHaveBeenCalledWith("/documents/d123");
  });

  it("uses cache on second hover", async () => {
    mockApiFetch
      .mockResolvedValueOnce([{ id: "d1", title: "Cached" }])
      .mockResolvedValueOnce({ document: { title: "Cached", content: "cached content", summary: "" } });
    const { result } = renderHook(() => useHoverPreview(true));
    act(() => { result.current.openHoverPreview(makeEvent(), "Cached"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(result.current.hoverPreview.content).toContain("cached content");

    act(() => { result.current.closeHoverPreview(); });
    vi.clearAllMocks();
    act(() => { result.current.openHoverPreview(makeEvent(), "Cached"); });
    expect(result.current.hoverPreview.loading).toBe(false);
    expect(result.current.hoverPreview.content).toContain("cached content");
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("handles API error", async () => {
    mockApiFetch.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useHoverPreview(true));
    act(() => { result.current.openHoverPreview(makeEvent(), "Test"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(result.current.hoverPreview.content).toContain("Failed");
  });

  it("shows no preview when target not found", async () => {
    mockApiFetch.mockResolvedValue([]);
    const { result } = renderHook(() => useHoverPreview(true));
    act(() => { result.current.openHoverPreview(makeEvent(), ""); });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(result.current.hoverPreview.content).toContain("No preview");
  });

  it("closeHoverPreview closes and stops loading", () => {
    const { result } = renderHook(() => useHoverPreview(true));
    mockApiFetch.mockResolvedValue([]);
    act(() => { result.current.openHoverPreview(makeEvent(), "Test"); });
    act(() => { result.current.closeHoverPreview(); });
    expect(result.current.hoverPreview.open).toBe(false);
    expect(result.current.hoverPreview.loading).toBe(false);
  });

  it("uses summary when available", async () => {
    mockApiFetch
      .mockResolvedValueOnce([{ id: "d1", title: "Test" }])
      .mockResolvedValueOnce({ document: { title: "Test", content: "long content", summary: "short summary" } });
    const { result } = renderHook(() => useHoverPreview(true));
    act(() => { result.current.openHoverPreview(makeEvent(), "Test"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(result.current.hoverPreview.content).toContain("short summary");
  });

  it("truncates long content to 180 chars", async () => {
    const longContent = "x".repeat(300);
    mockApiFetch
      .mockResolvedValueOnce([{ id: "d1", title: "Test" }])
      .mockResolvedValueOnce({ document: { title: "Test", content: longContent, summary: "" } });
    const { result } = renderHook(() => useHoverPreview(true));
    act(() => { result.current.openHoverPreview(makeEvent(), "Test"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(result.current.hoverPreview.content.length).toBeLessThanOrEqual(183);
    expect(result.current.hoverPreview.content.endsWith("...")).toBe(true);
  });
});
