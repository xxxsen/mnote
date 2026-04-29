import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useSlashMenu } from "../hooks/useSlashMenu";

beforeEach(() => { vi.clearAllMocks(); });

const makeOpts = () => ({
  editorViewRef: { current: null },
  handleFormat: vi.fn(),
  handleInsertTable: vi.fn(),
  insertTextAtCursor: vi.fn(),
});

describe("useSlashMenu", () => {
  it("initializes with closed menu", () => {
    const { result } = renderHook(() => useSlashMenu(makeOpts()));
    expect(result.current.slashMenu.open).toBe(false);
    expect(result.current.slashMenu.filter).toBe("");
    expect(result.current.slashIndex).toBe(0);
  });

  it("filteredSlashCommands returns all on empty filter", () => {
    const { result } = renderHook(() => useSlashMenu(makeOpts()));
    expect(result.current.filteredSlashCommands.length).toBeGreaterThan(0);
  });

  it("filteredSlashCommands filters by label", () => {
    const { result } = renderHook(() => useSlashMenu(makeOpts()));
    act(() => { result.current.setSlashMenu({ open: true, x: 0, y: 0, filter: "head" }); });
    const filtered = result.current.filteredSlashCommands;
    expect(filtered.every((c) => c.label.toLowerCase().includes("head") || c.id.toLowerCase().includes("head") || (c.keywords ?? []).some((k) => k.includes("head")))).toBe(true);
  });

  it("handleSlashKeyDown ArrowDown increments index", () => {
    const { result } = renderHook(() => useSlashMenu(makeOpts()));
    act(() => { result.current.setSlashMenu({ open: true, x: 0, y: 0, filter: "" }); });
    const ev = { key: "ArrowDown", preventDefault: vi.fn() };
    act(() => { result.current.handleSlashKeyDown(ev as never); });
    expect(result.current.slashIndex).toBe(1);
  });

  it("handleSlashKeyDown ArrowUp decrements index", () => {
    const { result } = renderHook(() => useSlashMenu(makeOpts()));
    act(() => { result.current.setSlashMenu({ open: true, x: 0, y: 0, filter: "" }); });
    act(() => { result.current.setSlashIndex(2); });
    const ev = { key: "ArrowUp", preventDefault: vi.fn() };
    act(() => { result.current.handleSlashKeyDown(ev as never); });
    expect(result.current.slashIndex).toBe(1);
  });

  it("handleSlashKeyDown Escape closes menu", () => {
    const { result } = renderHook(() => useSlashMenu(makeOpts()));
    act(() => { result.current.setSlashMenu({ open: true, x: 0, y: 0, filter: "" }); });
    const ev = { key: "Escape", preventDefault: vi.fn() };
    act(() => { result.current.handleSlashKeyDown(ev as never); });
    expect(result.current.slashMenu.open).toBe(false);
  });

  it("handleSlashKeyDown returns false when menu closed", () => {
    const { result } = renderHook(() => useSlashMenu(makeOpts()));
    const ev = { key: "Enter", preventDefault: vi.fn() };
    let handled = false;
    act(() => { handled = result.current.handleSlashKeyDown(ev as never); });
    expect(handled).toBe(false);
  });

  it("slashKeydownRef is updated", () => {
    const { result } = renderHook(() => useSlashMenu(makeOpts()));
    expect(typeof result.current.slashKeydownRef.current).toBe("function");
  });

  it("handleSlashKeyDown Enter calls action with view", () => {
    const mockView = {
      state: {
        selection: { main: { from: 5, head: 5 } },
        doc: { lineAt: () => ({ from: 0, text: "test/", to: 5 }) },
      },
      dispatch: vi.fn(),
    };
    const opts = { ...makeOpts(), editorViewRef: { current: mockView as never } };
    const { result } = renderHook(() => useSlashMenu(opts));
    act(() => { result.current.setSlashMenu({ open: true, x: 0, y: 0, filter: "" }); });
    const ev = { key: "Enter", preventDefault: vi.fn() };
    act(() => { result.current.handleSlashKeyDown(ev as never); });
    expect(result.current.slashMenu.open).toBe(false);
  });

  it("handleSlashAction removes slash prefix from editor", () => {
    const mockView = {
      state: {
        selection: { main: { from: 5 } },
        doc: {
          lineAt: () => ({ from: 0, text: "test/head", to: 9 }),
        },
      },
      dispatch: vi.fn(),
    };
    const opts = { ...makeOpts(), editorViewRef: { current: mockView as never } };
    const { result } = renderHook(() => useSlashMenu(opts));
    const action = vi.fn();
    act(() => { result.current.handleSlashAction(action); });
    expect(action).toHaveBeenCalled();
  });

  it("handleSlashAction no-ops when no view", () => {
    const opts = makeOpts();
    const { result } = renderHook(() => useSlashMenu(opts));
    const action = vi.fn();
    act(() => { result.current.handleSlashAction(action); });
    expect(action).not.toHaveBeenCalled();
  });

  it("handleSlashKeyDown Enter returns false when no commands", () => {
    const { result } = renderHook(() => useSlashMenu(makeOpts()));
    act(() => { result.current.setSlashMenu({ open: true, x: 0, y: 0, filter: "xyznonexistent" }); });
    const ev = { key: "Enter", preventDefault: vi.fn() };
    let handled = false;
    act(() => { handled = result.current.handleSlashKeyDown(ev as never); });
    expect(handled).toBe(false);
  });

  it("handleSlashKeyDown ArrowDown returns true for empty list", () => {
    const { result } = renderHook(() => useSlashMenu(makeOpts()));
    act(() => { result.current.setSlashMenu({ open: true, x: 0, y: 0, filter: "xyznonexistent" }); });
    const ev = { key: "ArrowDown", preventDefault: vi.fn() };
    let handled = false;
    act(() => { handled = result.current.handleSlashKeyDown(ev as never); });
    expect(handled).toBe(true);
  });

  it("handleSlashKeyDown unknown key returns false", () => {
    const { result } = renderHook(() => useSlashMenu(makeOpts()));
    act(() => { result.current.setSlashMenu({ open: true, x: 0, y: 0, filter: "" }); });
    const ev = { key: "a", preventDefault: vi.fn() };
    let handled = false;
    act(() => { handled = result.current.handleSlashKeyDown(ev as never); });
    expect(handled).toBe(false);
  });
});
