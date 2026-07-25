"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import {
  Dialog,
  DialogBody,
  DialogHeader,
} from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import type { EditorShellFlatContract } from "../editor-contracts";
import { useDesktopViewport } from "../hooks/useDesktopViewport";
import { LinkedNotesContent } from "./LinkedNotesContent";

const subscribeHydration = () => () => {};
const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function usePortalReady(): boolean {
  return useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
}

export function LinkedNotesOverlay({
  p,
}: {
  p: EditorShellFlatContract;
}) {
  const isDesktop = useDesktopViewport();
  if (isDesktop) return <LinkedNotesPopover p={p} />;
  return <LinkedNotesDrawer p={p} />;
}

function LinkedNotesDrawer({ p }: { p: EditorShellFlatContract }) {
  return (
    <Dialog
      open={p.documentLinks.open}
      title="Linked notes"
      description="Browse notes linked to and from this note."
      variant="drawer"
      drawerWidth="compact"
      returnFocusRef={p.documentLinks.mobileTriggerRef}
      onClose={p.documentLinks.closePanel}
    >
      <DialogHeader className="py-3" />
      <DialogBody className="flex min-h-0 flex-col overflow-hidden p-0">
        <LinkedNotesContent
          links={p.documentLinks}
          onPreview={(documentID) => {
            void p.preview.handleOpenPreview(documentID);
          }}
          onOpen={(documentID) => p.navigate(`/docs/${documentID}`)}
        />
      </DialogBody>
    </Dialog>
  );
}

type PopoverPosition = {
  ready: boolean;
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

function calculatePopoverPosition(
  trigger: HTMLButtonElement,
): PopoverPosition {
  const viewportMargin = 8;
  const gap = 8;
  const footerHeight = 32;
  const triggerRect = trigger.getBoundingClientRect();
  const rail = document.querySelector<HTMLElement>(
    '[data-testid="editor-context-rail"], [data-testid="editor-context-rail-collapsed"]',
  );
  const railLeft = rail?.getBoundingClientRect().left;
  const boundaryRight = Math.max(
    viewportMargin,
    Math.min(
      window.innerWidth - viewportMargin,
      railLeft === undefined
        ? window.innerWidth - viewportMargin
        : railLeft - gap,
    ),
  );
  const width = Math.min(380, window.innerWidth - viewportMargin * 2);
  const desiredRight = Math.min(triggerRect.right, boundaryRight);
  const left = Math.max(
    viewportMargin,
    Math.min(
      desiredRight - width,
      window.innerWidth - width - viewportMargin,
    ),
  );
  const top = triggerRect.bottom + gap;
  const availableHeight = Math.max(
    160,
    window.innerHeight - top - footerHeight - viewportMargin,
  );
  return {
    ready: true,
    left,
    top,
    width,
    maxHeight: Math.min(
      availableHeight,
      window.innerHeight * 0.6,
      34 * 16,
    ),
  };
}

function LinkedNotesPopover({ p }: { p: EditorShellFlatContract }) {
  const portalReady = usePortalReady();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleID = useId();
  const {
    closePanel,
    open,
    triggerRef,
  } = p.documentLinks;
  const [position, setPosition] = useState<PopoverPosition>({
    ready: false,
    left: 8,
    top: 8,
    width: 380,
    maxHeight: 400,
  });

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (trigger) setPosition(calculatePopoverPosition(trigger));
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [
    p.contextRail.collapsed,
    p.contextRail.isDocked,
    p.contextRail.view,
    open,
    triggerRef,
  ]);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => {
      panelRef.current
        ?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
        ?.focus();
    }, 0);
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      closePanel();
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closePanel();
      window.requestAnimationFrame(() =>
        triggerRef.current?.focus(),
      );
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [
    closePanel,
    open,
    triggerRef,
  ]);

  if (!portalReady || !open) return null;
  const style: CSSProperties = {
    left: position.left,
    top: position.top,
    width: position.width,
    maxHeight: position.maxHeight,
    visibility: position.ready ? "visible" : "hidden",
  };
  return createPortal(
    <div
      id="editor-linked-notes-popover"
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleID}
      style={style}
      className="fixed z-[180] flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95"
      onKeyDown={(event) =>
        handlePopoverTabBoundary(
          event,
          panelRef.current,
          triggerRef.current,
          closePanel,
        )
      }
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
        <h2 id={titleID} className="text-sm font-semibold">
          Linked notes
        </h2>
        <IconButton
          type="button"
          label="Close linked notes"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => {
            closePanel();
            window.requestAnimationFrame(() =>
              triggerRef.current?.focus(),
            );
          }}
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </IconButton>
      </div>
      <LinkedNotesContent
        links={p.documentLinks}
        onPreview={(documentID) => {
          void p.preview.handleOpenPreview(documentID);
        }}
        onOpen={(documentID) => p.navigate(`/docs/${documentID}`)}
      />
    </div>,
    document.body,
  );
}

function visibleFocusableElements(
  panel: HTMLElement,
): HTMLElement[] {
  return Array.from(
    panel.querySelectorAll<HTMLElement>(focusableSelector),
  ).filter((element) => element.offsetParent !== null);
}

function focusNextHeaderAction(trigger: HTMLButtonElement): void {
  const header = trigger.closest("header");
  const actions = header
    ? Array.from(
        header.querySelectorAll<HTMLButtonElement>(
          "button:not([disabled])",
        ),
      )
    : [];
  const index = actions.indexOf(trigger);
  (actions[index + 1] ?? trigger).focus();
}

function handlePopoverTabBoundary(
  event: KeyboardEvent<HTMLDivElement>,
  panel: HTMLDivElement | null,
  trigger: HTMLButtonElement | null,
  close: () => void,
) {
  if (event.key !== "Tab" || !panel || !trigger) return;
  const focusable = visibleFocusableElements(panel);
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    close();
    trigger.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    close();
    focusNextHeaderAction(trigger);
  }
}
