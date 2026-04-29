import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api";
import { useHoverPreview, resolveTargetId, fetchPreviewSnippet } from "../hooks/use-hover-preview";

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

  it("clears timer when opening twice quickly", async () => {
    mockApiFetch.mockResolvedValue([{ id: "d1", title: "T" }]);
    const { result } = renderHook(() => useHoverPreview(true));
    act(() => { result.current.openHoverPreview(makeEvent(), "First"); });
    act(() => { result.current.openHoverPreview(makeEvent(), "Second"); });
    expect(result.current.hoverPreview.title).toBe("Second");
  });

  it("cleans up timer on unmount", async () => {
    mockApiFetch.mockResolvedValue([{ id: "d1", title: "T" }]);
    const { result, unmount } = renderHook(() => useHoverPreview(true));
    act(() => { result.current.openHoverPreview(makeEvent(), "Test"); });
    unmount();
  });

  it("resolveTargetId uses first doc when no exact title match", async () => {
    mockApiFetch
      .mockResolvedValueOnce([{ id: "d1", title: "Other" }])
      .mockResolvedValueOnce({ document: { title: "Other", content: "Content", summary: "" } });
    const { result } = renderHook(() => useHoverPreview(true));
    act(() => { result.current.openHoverPreview(makeEvent(), "NoMatch"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(result.current.hoverPreview.loading).toBe(false);
  });

  it("fetchPreviewSnippet shows Empty note for empty content", async () => {
    mockApiFetch
      .mockResolvedValueOnce([{ id: "d1", title: "Empty" }])
      .mockResolvedValueOnce({ document: { title: "Empty", content: "", summary: "" } });
    const { result } = renderHook(() => useHoverPreview(true));
    act(() => { result.current.openHoverPreview(makeEvent(), "Empty"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(result.current.hoverPreview.content).toBe("Empty note");
  });

  it("resolveTargetId uses href with query/hash stripped", async () => {
    mockApiFetch.mockResolvedValue({ document: { title: "Doc", content: "C", summary: "" } });
    const { result } = renderHook(() => useHoverPreview(true));
    act(() => { result.current.openHoverPreview(makeEvent(), "Doc", "/docs/d1?tab=1#section"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(mockApiFetch).toHaveBeenCalledWith("/documents/d1");
  });

  it("closeHoverPreview no-op when no timer is set", () => {
    const { result } = renderHook(() => useHoverPreview(true));
    act(() => { result.current.closeHoverPreview(); });
    expect(result.current.hoverPreview.open).toBe(false);
  });

  it("caches by href when provided", async () => {
    mockApiFetch.mockResolvedValue({ document: { title: "D", content: "Data", summary: "" } });
    const { result } = renderHook(() => useHoverPreview(true));
    act(() => { result.current.openHoverPreview(makeEvent(), "D", "/docs/d1"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    act(() => { result.current.closeHoverPreview(); });
    vi.clearAllMocks();
    act(() => { result.current.openHoverPreview(makeEvent(), "D", "/docs/d1"); });
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(result.current.hoverPreview.content).toContain("Data");
  });

  it("resolveTargetId with /docs/ href with empty id falls through to title", async () => {
    mockApiFetch
      .mockResolvedValueOnce([{ id: "d1", title: "Test" }])
      .mockResolvedValueOnce({ document: { title: "Test", content: "Found", summary: "" } });
    const { result } = renderHook(() => useHoverPreview(true));
    act(() => { result.current.openHoverPreview(makeEvent(), "Test", "/docs/"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(result.current.hoverPreview.loading).toBe(false);
  });

  it("position clamping for near-edge hover", async () => {
    vi.stubGlobal("innerWidth", 300);
    vi.stubGlobal("innerHeight", 200);
    mockApiFetch.mockResolvedValue([]);
    const { result } = renderHook(() => useHoverPreview(true));
    const edgeEvent = makeEvent(290, 190);
    act(() => { result.current.openHoverPreview(edgeEvent, "Edge"); });
    expect(result.current.hoverPreview.open).toBe(true);
    vi.unstubAllGlobals();
  });
});

describe("resolveTargetId", () => {
  it("returns empty string when linkTitle is truthy but API returns empty docs", async () => {
    mockApiFetch.mockResolvedValue([]);
    const result = await resolveTargetId("NonExistent");
    expect(result).toBe("");
  });

  it("returns docs[0].id when no exact title match", async () => {
    mockApiFetch.mockResolvedValue([{ id: "d1", title: "Other" }]);
    const result = await resolveTargetId("Missing");
    expect(result).toBe("d1");
  });

  it("returns exact match id over first doc", async () => {
    mockApiFetch.mockResolvedValue([{ id: "d1", title: "Other" }, { id: "d2", title: "Exact" }]);
    const result = await resolveTargetId("Exact");
    expect(result).toBe("d2");
  });
});

describe("fetchPreviewSnippet", () => {
  it("uses linkTitle when document title is empty", async () => {
    mockApiFetch.mockResolvedValue({ document: { title: "", content: "Some content", summary: "" } });
    const result = await fetchPreviewSnippet("d1", "Fallback Title");
    expect(result.title).toBe("Fallback Title");
  });

  it("uses Untitled when both title and linkTitle are empty", async () => {
    mockApiFetch.mockResolvedValue({ document: { title: "", content: "Some content", summary: "" } });
    const result = await fetchPreviewSnippet("d1", "");
    expect(result.title).toBe("Untitled");
  });

  it("returns Empty note when content and summary are empty", async () => {
    mockApiFetch.mockResolvedValue({ document: { title: "T", content: "", summary: "" } });
    const result = await fetchPreviewSnippet("d1", "T");
    expect(result.content).toBe("Empty note");
  });
});
