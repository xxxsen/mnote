import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePopover } from "../hooks/usePopover";

const stableHandleFormat = vi.fn();

beforeEach(() => { vi.clearAllMocks(); });

describe("usePopover", () => {
  it("initializes with no active popover", () => {
    const { result } = renderHook(() => usePopover({ handleFormat: stableHandleFormat }));
    expect(result.current.activePopover).toBeNull();
    expect(result.current.popoverAnchor).toBeNull();
  });

  it("setActivePopover changes popover", () => {
    const { result } = renderHook(() => usePopover({ handleFormat: stableHandleFormat }));
    act(() => { result.current.setActivePopover("emoji"); });
    expect(result.current.activePopover).toBe("emoji");
  });

  it("handleColor calls handleFormat and closes", () => {
    const { result } = renderHook(() => usePopover({ handleFormat: stableHandleFormat }));
    act(() => { result.current.setActivePopover("color"); });
    act(() => { result.current.handleColor("red"); });
    expect(stableHandleFormat).toHaveBeenCalledWith("wrap", '<span style="color: red">', "</span>");
    expect(result.current.activePopover).toBeNull();
  });

  it("handleColor with empty color does not call handleFormat", () => {
    const { result } = renderHook(() => usePopover({ handleFormat: stableHandleFormat }));
    act(() => { result.current.handleColor(""); });
    expect(stableHandleFormat).not.toHaveBeenCalled();
  });

  it("handleSize calls handleFormat and closes", () => {
    const { result } = renderHook(() => usePopover({ handleFormat: stableHandleFormat }));
    act(() => { result.current.setActivePopover("size"); });
    act(() => { result.current.handleSize("1.5em"); });
    expect(stableHandleFormat).toHaveBeenCalledWith("wrap", '<span style="font-size: 1.5em">', "</span>");
    expect(result.current.activePopover).toBeNull();
  });

  it("handleSize with empty size does not call handleFormat", () => {
    const { result } = renderHook(() => usePopover({ handleFormat: stableHandleFormat }));
    act(() => { result.current.handleSize(""); });
    expect(stableHandleFormat).not.toHaveBeenCalled();
  });

  it("activeEmojiTab defaults to first tab", () => {
    const { result } = renderHook(() => usePopover({ handleFormat: stableHandleFormat }));
    expect(result.current.activeEmojiTab).toBeTruthy();
  });

  it("setEmojiTab changes active tab", () => {
    const { result } = renderHook(() => usePopover({ handleFormat: stableHandleFormat }));
    act(() => { result.current.setEmojiTab("animals"); });
    expect(result.current.emojiTab).toBe("animals");
  });

  it("renderPopover returns null when no anchor", () => {
    const { result } = renderHook(() => usePopover({ handleFormat: stableHandleFormat }));
    expect(result.current.renderPopover("content")).toBeNull();
  });

  it("exposes button refs", () => {
    const { result } = renderHook(() => usePopover({ handleFormat: stableHandleFormat }));
    expect(result.current.colorButtonRef).toBeDefined();
    expect(result.current.sizeButtonRef).toBeDefined();
    expect(result.current.emojiButtonRef).toBeDefined();
  });
});
