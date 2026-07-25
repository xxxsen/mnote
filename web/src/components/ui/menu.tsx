"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";

import { Button, type ButtonProps } from "./button";
import { cn } from "@/lib/utils";

export type MenuEntry = {
  id: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  onSelect?: () => void;
  children?: MenuEntry[];
};

type MenuProps = {
  label: string;
  trigger: ReactNode;
  entries: MenuEntry[];
  triggerVariant?: ButtonProps["variant"];
  triggerSize?: ButtonProps["size"];
  triggerClassName?: string;
  onTriggerElement?: (element: HTMLButtonElement | null) => void;
  align?: "start" | "end";
  width?: number;
};

type Position = { left: number; top: number };

const subscribeHydration = () => () => {};
let openMenu: { owner: symbol; close: () => void } | null = null;

function usePortalReady() {
  return useSyncExternalStore(subscribeHydration, () => true, () => false);
}

function useTriggerElement(
  onTriggerElement?: (element: HTMLButtonElement | null) => void,
) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const setTriggerElement = useCallback(
    (element: HTMLButtonElement | null) => {
      triggerRef.current = element;
      onTriggerElement?.(element);
    },
    [onTriggerElement],
  );
  return { triggerRef, setTriggerElement };
}

function enabledIndexes(entries: MenuEntry[]) {
  return entries.flatMap((entry, index) => entry.disabled ? [] : [index]);
}

function nextEnabled(entries: MenuEntry[], current: number, direction: 1 | -1) {
  const enabled = enabledIndexes(entries);
  if (enabled.length === 0) return -1;
  const position = enabled.indexOf(current);
  if (position === -1) return direction === 1 ? enabled[0] : enabled.at(-1) ?? -1;
  return enabled[(position + direction + enabled.length) % enabled.length];
}

function topLevelPosition(
  element: HTMLElement,
  width: number,
  align: "start" | "end",
): Position {
  const rect = element.getBoundingClientRect();
  const desiredLeft = align === "end" ? rect.right - width : rect.left;
  return {
    left: Math.max(8, Math.min(desiredLeft, window.innerWidth - width - 8)),
    top: Math.min(rect.bottom + 8, window.innerHeight - 64),
  };
}

function submenuPosition(element: HTMLElement, width: number): Position {
  const rect = element.getBoundingClientRect();
  const fitsRight = rect.right + width + 8 <= window.innerWidth;
  return {
    left: fitsRight ? rect.right + 4 : Math.max(8, rect.left - width - 4),
    top: Math.max(8, Math.min(rect.top, window.innerHeight - 64)),
  };
}

type SubmenuPanelProps = {
  parentIndex: number | null;
  parentEntries: MenuEntry[];
  position: Position;
  width: number;
  panelRef: RefObject<HTMLDivElement | null>;
  itemRefs: RefObject<Array<HTMLButtonElement | null>>;
  parentItemRefs: RefObject<Array<HTMLButtonElement | null>>;
  onClose: () => void;
  onSelect: (entry: MenuEntry) => void;
};

function SubmenuPanel({
  parentIndex,
  parentEntries,
  position,
  width,
  panelRef,
  itemRefs,
  parentItemRefs,
  onClose,
  onSelect,
}: SubmenuPanelProps) {
  if (parentIndex === null) return null;
  const localItemRefs = itemRefs;
  const entries = parentEntries[parentIndex]?.children ?? [];
  const style: CSSProperties = {
    left: position.left,
    top: position.top,
    width,
    maxHeight: `calc(100dvh - ${Math.max(16, position.top + 8)}px)`,
  };
  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label={`${parentEntries[parentIndex].label} submenu`}
      style={style}
      className="fixed z-[241] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
      onKeyDown={(event) => {
        const current = itemRefs.current.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const next = nextEnabled(entries, current, event.key === "ArrowDown" ? 1 : -1);
          itemRefs.current[next]?.focus();
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault();
          const indexes = enabledIndexes(entries);
          itemRefs.current[event.key === "Home" ? indexes[0] : indexes.at(-1) ?? -1]?.focus();
        } else if (event.key === "ArrowLeft" || event.key === "Escape") {
          event.preventDefault();
          onClose();
          parentItemRefs.current[parentIndex]?.focus();
        }
      }}
    >
      {entries.map((entry, index) => (
        <button
          key={entry.id}
          ref={(element) => { localItemRefs.current[index] = element; }}
          type="button"
          role="menuitem"
          disabled={entry.disabled}
          className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-40 sm:min-h-10"
          onClick={() => onSelect(entry)}
        >
          {entry.icon ? <span aria-hidden="true">{entry.icon}</span> : null}
          <span className="truncate">{entry.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Menu({
  label,
  trigger,
  entries,
  triggerVariant = "ghost",
  triggerSize = "icon",
  triggerClassName,
  onTriggerElement,
  align = "end",
  width = 224,
}: MenuProps) {
  const id = useId();
  const panelID = `menu-${id.replaceAll(":", "")}`;
  const portalReady = usePortalReady();
  const { triggerRef, setTriggerElement } =
    useTriggerElement(onTriggerElement);
  const panelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const submenuRef = useRef<HTMLDivElement>(null);
  const submenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pendingItemFocus = useRef<number | null>(null);
  const pendingSubmenuFocus = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position>({ left: 8, top: 8 });
  const [submenuIndex, setSubmenuIndex] = useState<number | null>(null);
  const [submenuPositionValue, setSubmenuPositionValue] = useState<Position>({ left: 8, top: 8 });
  const owner = useRef(Symbol("menu")).current;
  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    setSubmenuIndex(null);
    if (openMenu?.owner === owner) openMenu = null;
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }, [owner, triggerRef]);

  const focusItem = useCallback((index: number) => {
    if (index < 0) return;
    pendingItemFocus.current = index;
    requestAnimationFrame(() => itemRefs.current[index]?.focus());
  }, []);

  const show = useCallback((focus: "first" | "last" = "first") => {
    if (!triggerRef.current) return;
    openMenu?.close();
    openMenu = { owner, close: () => close(false) };
    setPosition(topLevelPosition(triggerRef.current, width, align));
    const enabled = enabledIndexes(entries);
    const target = focus === "first" ? enabled[0] : enabled.at(-1);
    pendingItemFocus.current = target ?? null;
    setOpen(true);
  }, [align, close, entries, owner, triggerRef, width]);

  const showSubmenu = useCallback((index: number) => {
    const triggerElement = itemRefs.current[index];
    if (!triggerElement || !entries[index]?.children?.length) return;
    setSubmenuPositionValue(submenuPosition(triggerElement, width));
    pendingSubmenuFocus.current = enabledIndexes(entries[index].children ?? [])[0] ?? null;
    setSubmenuIndex(index);
  }, [entries, width]);

  useLayoutEffect(() => {
    if (!open || pendingItemFocus.current === null) return;
    itemRefs.current[pendingItemFocus.current]?.focus();
    pendingItemFocus.current = null;
  }, [open]);

  useLayoutEffect(() => {
    if (submenuIndex === null || pendingSubmenuFocus.current === null) return;
    submenuItemRefs.current[pendingSubmenuFocus.current]?.focus();
    pendingSubmenuFocus.current = null;
  }, [submenuIndex]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const reposition = () => {
      if (triggerRef.current) setPosition(topLevelPosition(triggerRef.current, width, align));
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [align, open, triggerRef, width]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target)
        && !panelRef.current?.contains(target)
        && !submenuRef.current?.contains(target)
      ) {
        close(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [close, open, triggerRef]);

  useEffect(() => () => {
    if (openMenu?.owner === owner) openMenu = null;
  }, [owner]);

  const selectEntry = (entry: MenuEntry) => {
    if (entry.disabled) return;
    entry.onSelect?.();
    close(false);
  };

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = itemRefs.current.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusItem(nextEnabled(entries, current, event.key === "ArrowDown" ? 1 : -1));
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const indexes = enabledIndexes(entries);
      focusItem(event.key === "Home" ? indexes[0] : indexes.at(-1) ?? -1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowRight" && entries[current]?.children?.length) {
      event.preventDefault();
      showSubmenu(current);
    }
  };

  const panelStyle: CSSProperties = {
    left: position.left,
    top: position.top,
    width,
    maxHeight: `calc(100dvh - ${Math.max(16, position.top + 8)}px)`,
  };

  return (
    <>
      <Button
        ref={setTriggerElement}
        type="button"
        variant={triggerVariant}
        size={triggerSize}
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelID : undefined}
        onClick={() => open ? close() : show()}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            show(event.key === "ArrowDown" ? "first" : "last");
          }
        }}
      >
        {trigger}
      </Button>
      {portalReady && open ? createPortal(
        <>
          <div
            id={panelID}
            ref={panelRef}
            role="menu"
            aria-label={label}
            style={panelStyle}
            className="fixed z-[240] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95"
            onKeyDown={onPanelKeyDown}
          >
            {entries.map((entry, index) => (
              <button
                key={entry.id}
                ref={(element) => { itemRefs.current[index] = element; }}
                type="button"
                role="menuitem"
                disabled={entry.disabled}
                aria-haspopup={entry.children?.length ? "menu" : undefined}
                aria-expanded={entry.children?.length ? submenuIndex === index : undefined}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm outline-none transition-colors sm:min-h-10",
                  "hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
                  "disabled:pointer-events-none disabled:opacity-40",
                )}
                onClick={() => entry.children?.length ? showSubmenu(index) : selectEntry(entry)}
              >
                {entry.icon ? <span aria-hidden="true">{entry.icon}</span> : null}
                <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                {entry.children?.length ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
          <SubmenuPanel
            parentIndex={submenuIndex}
            parentEntries={entries}
            position={submenuPositionValue}
            width={width}
            panelRef={submenuRef}
            itemRefs={submenuItemRefs}
            parentItemRefs={itemRefs}
            onClose={() => setSubmenuIndex(null)}
            onSelect={selectEntry}
          />
        </>,
        document.body,
      ) : null}
    </>
  );
}
