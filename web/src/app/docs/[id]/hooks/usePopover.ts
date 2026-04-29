import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { EMOJI_TABS } from "../constants";

export function usePopover(opts: {
  handleFormat: (type: "wrap" | "line", prefix: string, suffix?: string) => void;
}) {
  const { handleFormat } = opts;

  const [activePopover, setActivePopover] = useState<"emoji" | "color" | "size" | null>(null);
  const [popoverAnchor, setPopoverAnchor] = useState<{ top: number; left: number } | null>(null);
  const [emojiTab, setEmojiTab] = useState(EMOJI_TABS[0].key);
  const colorButtonRef = useRef<HTMLButtonElement | null>(null);
  const sizeButtonRef = useRef<HTMLButtonElement | null>(null);
  const emojiButtonRef = useRef<HTMLButtonElement | null>(null);

  const activeEmojiTab = useMemo(
    () => EMOJI_TABS.find((tab) => tab.key === emojiTab) || EMOJI_TABS[0],
    [emojiTab]
  );

  /* v8 ignore start -- popover positioning requires real DOM viewport measurements */
  useEffect(() => {
    if (!activePopover) return;
    const updateAnchor = () => {
      const ref = activePopover === "color" ? colorButtonRef.current
        : activePopover === "size" ? sizeButtonRef.current : emojiButtonRef.current;
      if (!ref) return;
      const rect = ref.getBoundingClientRect();
      setPopoverAnchor({ top: rect.bottom + 8, left: rect.left });
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
      if (!target) return;
      if (target.closest("[data-popover-panel]") || target.closest("[data-popover-trigger]")) return;
      setActivePopover(null);
    };
    window.addEventListener("pointerdown", handlePointer);
    return () => window.removeEventListener("pointerdown", handlePointer);
  }, [activePopover]);
  /* v8 ignore stop */

  const handleColor = useCallback((color: string) => {
    setActivePopover(null);
    if (!color) return;
    handleFormat("wrap", `<span style="color: ${color}">`, "</span>");
  }, [handleFormat]);

  const handleSize = useCallback((size: string) => {
    setActivePopover(null);
    if (!size) return;
    handleFormat("wrap", `<span style="font-size: ${size}">`, "</span>");
  }, [handleFormat]);

  const renderPopover = useCallback((content: React.ReactNode) => {
    /* v8 ignore next -- SSR guard untestable in jsdom */
    if (!popoverAnchor || typeof document === "undefined") return null;
    return createPortal(
      React.createElement("div", {
        "data-popover-panel": true,
        className: "fixed z-[200]",
        style: { top: popoverAnchor.top, left: popoverAnchor.left },
      }, content),
      document.body
    );
  }, [popoverAnchor]);

  return {
    activePopover, setActivePopover,
    popoverAnchor,
    emojiTab, setEmojiTab,
    activeEmojiTab,
    colorButtonRef, sizeButtonRef, emojiButtonRef,
    handleColor, handleSize,
    renderPopover,
  };
}
