import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api";
import { useWikilinkMenu } from "../hooks/useWikilinkMenu";

const mockApiFetch = vi.mocked(apiFetch);

const makeOpts = () => ({
  editorViewRef: { current: null },
  contentRef: { current: "" },
  lastSavedContentRef: { current: "" },
  schedulePreviewUpdate: vi.fn(),
  setContent: vi.fn(),
  setPreviewContent: vi.fn(),
  setHasUnsavedChanges: vi.fn(),
});

beforeEach(() => { vi.clearAllMocks(); });

describe("useWikilinkMenu", () => {
  it("initializes with closed menu", () => {
    const { result } = renderHook(() => useWikilinkMenu(makeOpts()));
    expect(result.current.wikilinkMenu.open).toBe(false);
    expect(result.current.wikilinkResults).toEqual([]);
    expect(result.current.wikilinkLoading).toBe(false);
  });

  it("fetches documents when menu opens", async () => {
    mockApiFetch.mockResolvedValue([{ id: "d1", title: "Doc 1" }]);
    const { result } = renderHook(() => useWikilinkMenu(makeOpts()));
    act(() => { result.current.setWikilinkMenu({ open: true, x: 0, y: 0, query: "test", from: 0 }); });
    await waitFor(() => { expect(result.current.wikilinkLoading).toBe(false); });
    await waitFor(() => { expect(result.current.wikilinkResults).toHaveLength(1); });
  });

  it("clears results when menu closes", async () => {
    mockApiFetch.mockResolvedValue([{ id: "d1", title: "Doc 1" }]);
    const { result } = renderHook(() => useWikilinkMenu(makeOpts()));
    act(() => { result.current.setWikilinkMenu({ open: true, x: 0, y: 0, query: "", from: 0 }); });
    await waitFor(() => { expect(result.current.wikilinkResults.length).toBeGreaterThanOrEqual(0); });
    act(() => { result.current.setWikilinkMenu({ open: false, x: 0, y: 0, query: "", from: 0 }); });
    expect(result.current.wikilinkResults).toEqual([]);
  });

  it("handleWikilinkKeyDown returns false when menu closed", () => {
    const { result } = renderHook(() => useWikilinkMenu(makeOpts()));
    let handled = false;
    act(() => { handled = result.current.handleWikilinkKeyDown({ key: "Enter", preventDefault: vi.fn() } as never); });
    expect(handled).toBe(false);
  });

  it("handleWikilinkKeyDown ArrowDown moves index", async () => {
    mockApiFetch.mockResolvedValue([{ id: "d1", title: "A" }, { id: "d2", title: "B" }]);
    const { result } = renderHook(() => useWikilinkMenu(makeOpts()));
    act(() => { result.current.setWikilinkMenu({ open: true, x: 0, y: 0, query: "", from: 0 }); });
    await waitFor(() => { expect(result.current.wikilinkResults).toHaveLength(2); });
    const ev = { key: "ArrowDown", preventDefault: vi.fn() };
    act(() => { result.current.handleWikilinkKeyDown(ev as never); });
    expect(result.current.wikilinkIndex).toBe(1);
  });

  it("handleWikilinkKeyDown Escape closes menu", async () => {
    mockApiFetch.mockResolvedValue([{ id: "d1", title: "A" }]);
    const { result } = renderHook(() => useWikilinkMenu(makeOpts()));
    act(() => { result.current.setWikilinkMenu({ open: true, x: 0, y: 0, query: "", from: 0 }); });
    await waitFor(() => { expect(result.current.wikilinkResults).toHaveLength(1); });
    act(() => { result.current.handleWikilinkKeyDown({ key: "Escape", preventDefault: vi.fn() } as never); });
    expect(result.current.wikilinkMenu.open).toBe(false);
  });

  it("wikilinkKeydownRef is updated", () => {
    const { result } = renderHook(() => useWikilinkMenu(makeOpts()));
    expect(typeof result.current.wikilinkKeydownRef.current).toBe("function");
  });

  it("handles API error gracefully", async () => {
    mockApiFetch.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useWikilinkMenu(makeOpts()));
    act(() => { result.current.setWikilinkMenu({ open: true, x: 0, y: 0, query: "test", from: 0 }); });
    await waitFor(() => { expect(result.current.wikilinkLoading).toBe(false); });
    expect(result.current.wikilinkResults).toEqual([]);
  });

  it("handleWikilinkKeyDown ArrowUp moves index up", async () => {
    mockApiFetch.mockResolvedValue([{ id: "d1", title: "A" }, { id: "d2", title: "B" }]);
    const { result } = renderHook(() => useWikilinkMenu(makeOpts()));
    act(() => { result.current.setWikilinkMenu({ open: true, x: 0, y: 0, query: "", from: 0 }); });
    await waitFor(() => { expect(result.current.wikilinkResults).toHaveLength(2); });
    act(() => { result.current.handleWikilinkKeyDown({ key: "ArrowDown", preventDefault: vi.fn() } as never); });
    expect(result.current.wikilinkIndex).toBe(1);
    act(() => { result.current.handleWikilinkKeyDown({ key: "ArrowUp", preventDefault: vi.fn() } as never); });
    expect(result.current.wikilinkIndex).toBe(0);
  });

  it("handleWikilinkKeyDown Enter selects document", async () => {
    mockApiFetch.mockResolvedValue([{ id: "d1", title: "Doc1" }]);
    const mockView = {
      state: {
        selection: { main: { head: 5 } },
        doc: { toString: () => "[[Doc" },
      },
      dispatch: vi.fn(),
      focus: vi.fn(),
    };
    const opts = { ...makeOpts(), editorViewRef: { current: mockView as never } };
    const { result } = renderHook(() => useWikilinkMenu(opts));
    act(() => { result.current.setWikilinkMenu({ open: true, x: 0, y: 0, query: "Doc", from: 0 }); });
    await waitFor(() => { expect(result.current.wikilinkResults).toHaveLength(1); });
    const ev = { key: "Enter", preventDefault: vi.fn() };
    act(() => { result.current.handleWikilinkKeyDown(ev as never); });
    expect(mockView.dispatch).toHaveBeenCalled();
    expect(result.current.wikilinkMenu.open).toBe(false);
  });

  it("handleWikilinkSelect with ]] suffix", async () => {
    mockApiFetch.mockResolvedValue([{ id: "d1", title: "Doc1" }]);
    const mockView = {
      state: {
        selection: { main: { head: 5 } },
        doc: { toString: () => "[[Doc]]" },
      },
      dispatch: vi.fn(),
      focus: vi.fn(),
    };
    const opts = { ...makeOpts(), editorViewRef: { current: mockView as never } };
    const { result } = renderHook(() => useWikilinkMenu(opts));
    act(() => { result.current.setWikilinkMenu({ open: true, x: 0, y: 0, query: "Doc", from: 0 }); });
    await waitFor(() => { expect(result.current.wikilinkResults).toHaveLength(1); });
    act(() => { result.current.handleWikilinkSelect("Doc1", "d1"); });
    expect(mockView.dispatch).toHaveBeenCalledWith(expect.objectContaining({
      changes: expect.objectContaining({ to: 7 }),
    }));
  });

  it("handleWikilinkSelect no-ops without view", () => {
    const { result } = renderHook(() => useWikilinkMenu(makeOpts()));
    act(() => { result.current.handleWikilinkSelect("Doc", "d1"); });
  });

  it("handleWikilinkKeyDown unknown key returns false", async () => {
    mockApiFetch.mockResolvedValue([{ id: "d1", title: "A" }]);
    const { result } = renderHook(() => useWikilinkMenu(makeOpts()));
    act(() => { result.current.setWikilinkMenu({ open: true, x: 0, y: 0, query: "", from: 0 }); });
    await waitFor(() => { expect(result.current.wikilinkResults).toHaveLength(1); });
    let handled = false;
    act(() => { handled = result.current.handleWikilinkKeyDown({ key: "a", preventDefault: vi.fn() } as never); });
    expect(handled).toBe(false);
  });
});
