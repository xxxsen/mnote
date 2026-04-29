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

  it("handleColor with empty color does nothing", () => {
    const { result } = renderHook(() => usePopover({ handleFormat: stableHandleFormat }));
    act(() => { result.current.handleColor(""); });
    expect(stableHandleFormat).not.toHaveBeenCalled();
  });

  it("handleSize with empty size does nothing", () => {
    const { result } = renderHook(() => usePopover({ handleFormat: stableHandleFormat }));
    act(() => { result.current.handleSize(""); });
    expect(stableHandleFormat).not.toHaveBeenCalled();
  });

  it("pointerdown outside popover closes it", () => {
    const { result } = renderHook(() => usePopover({ handleFormat: stableHandleFormat }));
    act(() => { result.current.setActivePopover("color"); });
    const event = new PointerEvent("pointerdown", { bubbles: true });
    Object.defineProperty(event, "target", { value: document.body });
    act(() => { window.dispatchEvent(event); });
    expect(result.current.activePopover).toBeNull();
  });

  it("pointerdown on popover trigger does not close", () => {
    const { result } = renderHook(() => usePopover({ handleFormat: stableHandleFormat }));
    act(() => { result.current.setActivePopover("color"); });
    const trigger = document.createElement("button");
    trigger.setAttribute("data-popover-trigger", "true");
    document.body.appendChild(trigger);
    const event = new PointerEvent("pointerdown", { bubbles: true });
    Object.defineProperty(event, "target", { value: trigger });
    act(() => { window.dispatchEvent(event); });
    expect(result.current.activePopover).toBe("color");
    document.body.removeChild(trigger);
  });

  it("popoverAnchor updates from button ref getBoundingClientRect", () => {
    const { result } = renderHook(() => usePopover({ handleFormat: stableHandleFormat }));
    const btn = document.createElement("button");
    Object.defineProperty(btn, "getBoundingClientRect", { value: () => ({ bottom: 100, left: 50, top: 80, right: 150, width: 100, height: 20 }) });
    (result.current.colorButtonRef as { current: HTMLButtonElement | null }).current = btn;
    act(() => { result.current.setActivePopover("color"); });
    expect(result.current.popoverAnchor).toBeTruthy();
  });
});
