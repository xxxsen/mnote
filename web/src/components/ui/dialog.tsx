"use client";

import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

const FOCUSABLE = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export type DialogProps = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose?: () => void;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  className?: string;
  backdropClassName?: string;
};

export function Dialog({
  open,
  title,
  description,
  children,
  onClose,
  closeOnEscape = true,
  closeOnBackdrop = true,
  initialFocusRef,
  className = "",
  backdropClassName = "",
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      const target = initialFocusRef?.current
        ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)
        ?? panelRef.current;
      target?.focus();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
    };
  }, [initialFocusRef, open]);

  if (!open) return null;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      if (closeOnEscape && onClose) {
        event.preventDefault();
        onClose();
      }
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    ).filter((element) => element.offsetParent !== null);
    if (focusable.length === 0) {
      event.preventDefault();
      panelRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-3 ${backdropClassName}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && closeOnBackdrop && onClose) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        data-dialog-title={title}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`max-h-[calc(100dvh-24px)] w-full overflow-auto rounded-xl border border-border bg-background shadow-2xl outline-none ${className}`}
      >
        <h2 id={titleId} className="sr-only">{title}</h2>
        {description && <p id={descriptionId} className="sr-only">{description}</p>}
        {children}
      </div>
    </div>
  );
}
