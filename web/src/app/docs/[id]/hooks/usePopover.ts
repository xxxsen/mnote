import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { EMOJI_TABS } from "../constants";

type Rect = { top: number; bottom: number; left: number; right: number; width: number; height: number };
type Viewport = { width: number; height: number };

export function getFloatingPosition(
  anchorRect: Rect,
  panelRect: { width: number; height: number },
  viewport: Viewport,
  gap = 8,
) {
  const availableBelow = viewport.height - anchorRect.bottom - gap;
  const availableAbove = anchorRect.top - gap;
  const placeAbove = availableBelow < panelRect.height && availableAbove > availableBelow;
  const maxHeight = Math.max(80, placeAbove ? availableAbove : availableBelow);
  const top = placeAbove
    ? Math.max(gap, anchorRect.top - Math.min(panelRect.height, maxHeight) - gap)
    : anchorRect.bottom + gap;
  const left = Math.max(
    gap,
    Math.min(anchorRect.left, viewport.width - Math.min(panelRect.width, viewport.width - gap * 2) - gap),
  );
  return { top, left, maxHeight, placement: placeAbove ? "top" as const : "bottom" as const };
}

export function usePopover(opts: {
  handleFormat: (type: "wrap" | "line", prefix: string, suffix?: string) => void;
}) {
  const { handleFormat } = opts;
  const [activePopover, setActivePopover] = useState<"emoji" | "color" | "size" | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const [emojiTab, setEmojiTab] = useState(EMOJI_TABS[0].key);
  const colorButtonRef = useRef<HTMLButtonElement | null>(null);
  const sizeButtonRef = useRef<HTMLButtonElement | null>(null);
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null);

  const activeEmojiTab = useMemo(
    () => EMOJI_TABS.find((tab) => tab.key === emojiTab) || EMOJI_TABS[0],
    [emojiTab],
  );

  useEffect(() => {
    if (!activePopover) return;
    const updateAnchor = () => {
      const ref = activePopover === "color" ? colorButtonRef.current
        : activePopover === "size" ? sizeButtonRef.current : emojiButtonRef.current;
      if (!ref) return;
      const rect = ref.getBoundingClientRect();
      const size = activePopover === "emoji"
        ? { width: Math.min(320, window.innerWidth - 16), height: 320 }
        : activePopover === "color"
          ? { width: 216, height: 190 }
          : { width: 160, height: 240 };
      setPopoverAnchor(getFloatingPosition(rect, size, {
        width: window.innerWidth,
        height: window.innerHeight,
      }));
    };
    updateAnchor();
    window.addEventListener("resize", updateAnchor);
    window.addEventListener("scroll", updateAnchor, true);
    return () => {
      window.removeEventListener("resize", updateAnchor);
      window.removeEventListener("scroll", updateAnchor, true);
    };
  }, [activePopover]);

  useEffect(() => {
    if (!activePopover) return;
    const handlePointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-popover-panel], [data-popover-trigger]")) return;
      setActivePopover(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActivePopover(null);
    };
    window.addEventListener("pointerdown", handlePointer);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activePopover]);

  const handleColor = useCallback((color: string) => {
    setActivePopover(null);
    if (color) handleFormat("wrap", `<span style="color: ${color}">`, "</span>");
  }, [handleFormat]);

  const handleSize = useCallback((size: string) => {
    setActivePopover(null);
    if (size) handleFormat("wrap", `<span style="font-size: ${size}">`, "</span>");
  }, [handleFormat]);

  const renderPopover = useCallback((content: React.ReactNode) => {
    if (!popoverAnchor || typeof document === "undefined") return null;
    return createPortal(
      React.createElement("div", {
        "data-popover-panel": true,
        className: "fixed z-[220] max-w-[calc(100vw-16px)] overflow-y-auto",
        style: {
          top: popoverAnchor.top,
          left: popoverAnchor.left,
          maxHeight: popoverAnchor.maxHeight,
        },
      }, content),
      document.body,
    );
  }, [popoverAnchor]);

  return {
    activePopover,
    setActivePopover,
    popoverAnchor,
    emojiTab,
    setEmojiTab,
    activeEmojiTab,
    colorButtonRef,
    sizeButtonRef,
    emojiButtonRef,
    handleColor,
    handleSize,
    renderPopover,
  };
}
