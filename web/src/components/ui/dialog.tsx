"use client";

import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { isTopDialog, registerDialog } from "./dialog-stack";

export { DialogStatus, type DialogStatusProps } from "./dialog-status";

const FOCUSABLE = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export type DialogVariant = "modal" | "command" | "sheet" | "drawer" | "fullscreen";
export type DialogSize = "sm" | "md" | "lg" | "xl";
export type DialogDrawerWidth = "default" | "compact";
export type DialogDismissPolicy = "always" | "when-idle" | "explicit";
export type DialogCloseReason =
  | "escape"
  | "backdrop"
  | "close-button"
  | "cancel-button"
  | "completed";

export type DialogProps = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose?: (reason: DialogCloseReason) => void;
  variant?: DialogVariant;
  size?: DialogSize;
  drawerWidth?: DialogDrawerWidth;
  dismissPolicy?: DialogDismissPolicy;
  busy?: boolean;
  role?: "dialog" | "alertdialog";
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

type DialogContextValue = {
  title: string;
  description?: string;
  dismissDisabled: boolean;
  requestClose: (reason: DialogCloseReason) => void;
};

const DialogContext = createContext<DialogContextValue | null>(null);

const sizeClasses: Record<DialogSize, string> = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
  lg: "h-full max-h-none rounded-none border-0 sm:h-auto sm:max-h-[calc(100dvh-1.5rem)] sm:max-w-2xl sm:rounded-2xl sm:border",
  xl: "h-full max-h-none rounded-none border-0 sm:h-auto sm:max-h-[calc(100dvh-1.5rem)] sm:max-w-5xl sm:rounded-2xl sm:border",
};

const backdropVariantClasses: Record<DialogVariant, string> = {
  modal: "items-end justify-center p-0 sm:items-center sm:p-3",
  command: "items-start justify-center p-2 sm:p-3",
  sheet: "items-end justify-center p-0",
  drawer: "items-stretch justify-end p-0",
  fullscreen: "items-stretch justify-center p-0 sm:p-4",
};

const panelVariantClasses: Record<DialogVariant, string> = {
  modal: "max-h-[calc(100dvh-8px)] rounded-t-2xl sm:max-h-[min(90dvh,56rem)] sm:rounded-2xl",
  command: "mt-[10dvh] max-h-[min(80dvh,42rem)] rounded-2xl",
  sheet: "max-h-[calc(100dvh-8px)] rounded-t-2xl",
  drawer: "h-full max-h-none max-w-none rounded-none sm:rounded-l-2xl",
  fullscreen: "h-full max-h-none max-w-none rounded-none sm:h-[calc(100dvh-32px)] sm:rounded-2xl",
};

const panelDurationClasses: Record<DialogVariant, string> = {
  modal: "duration-[180ms]",
  command: "duration-[180ms]",
  sheet: "duration-200",
  drawer: "duration-200",
  fullscreen: "duration-[180ms]",
};

const panelHiddenClasses: Record<DialogVariant, string> = {
  modal: "translate-y-1 scale-[0.99] opacity-0",
  command: "-translate-y-1 scale-[0.99] opacity-0",
  sheet: "translate-y-full opacity-0",
  drawer: "translate-x-full opacity-0",
  fullscreen: "scale-[0.99] opacity-0",
};

function useDialogContext(componentName: string) {
  const context = useContext(DialogContext);
  if (!context) throw new Error(`${componentName} must be used inside Dialog`);
  return context;
}

function getDismissDisabled(policy: DialogDismissPolicy, busy: boolean) {
  if (policy === "explicit") return true;
  return policy === "when-idle" && busy;
}

function canRequestClose(reason: DialogCloseReason, dismissDisabled: boolean) {
  if (["escape", "backdrop", "close-button"].includes(reason)) return !dismissDisabled;
  return true;
}

function getFocusableElements(panel: HTMLDivElement | null) {
  return Array.from(
    panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
  ).filter((element) => element.offsetParent !== null);
}

function moveTrappedFocus(
  event: KeyboardEvent<HTMLDivElement>,
  panel: HTMLDivElement | null,
) {
  const focusable = getFocusableElements(panel);
  if (focusable.length === 0) {
    event.preventDefault();
    panel?.focus();
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
}

function useDialogController({
  open,
  stackId,
  dismissDisabled,
  onClose,
  initialFocusRef,
  returnFocusRef,
}: Pick<
  DialogProps,
  | "open"
  | "onClose"
  | "initialFocusRef"
  | "returnFocusRef"
> & {
  stackId: string;
  dismissDisabled: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const requestClose = (reason: DialogCloseReason) => {
    const allowed = canRequestClose(reason, dismissDisabled);
    if (open && onClose && isTopDialog(stackId) && allowed) onClose(reason);
  };

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const returnTarget = returnFocusRef?.current;
    const unregister = registerDialog(stackId);
    const target = initialFocusRef?.current
      ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)
      ?? panelRef.current;
    target?.focus();
    const focusTimer = window.setTimeout(() => target?.focus(), 16);
    return () => {
      window.clearTimeout(focusTimer);
      unregister();
      (returnTarget ?? restoreFocusRef.current)?.focus();
    };
  }, [initialFocusRef, open, returnFocusRef, stackId]);

  useEffect(() => {
    if (!open) return;
    const handleDocumentKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || !isTopDialog(stackId)) return;
      event.preventDefault();
      event.stopPropagation();
      if (onClose && canRequestClose("escape", dismissDisabled)) onClose("escape");
    };
    document.addEventListener("keydown", handleDocumentKeyDown, true);
    return () => document.removeEventListener("keydown", handleDocumentKeyDown, true);
  }, [dismissDisabled, onClose, open, stackId]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Tab" && isTopDialog(stackId)) {
      moveTrappedFocus(event, panelRef.current);
    }
  };

  return { panelRef, requestClose, handleKeyDown };
}

function getDialogAccessibility(
  open: boolean,
  role: "dialog" | "alertdialog",
  titleId: string,
  descriptionId: string,
  hasDescription: boolean,
) {
  if (!open) return {};
  return {
    role,
    "aria-modal": "true" as const,
    "aria-labelledby": titleId,
    "aria-describedby": hasDescription ? descriptionId : undefined,
    tabIndex: -1,
  };
}

function getPanelSizeClass(variant: DialogVariant, size: DialogSize) {
  if (variant === "drawer" || variant === "fullscreen") return undefined;
  return sizeClasses[size];
}

function getDrawerWidthClass(
  variant: DialogVariant,
  drawerWidth: DialogDrawerWidth,
) {
  if (variant !== "drawer") return undefined;
  return drawerWidth === "compact" ? "lg:max-w-96" : "sm:max-w-md";
}

type DialogLayerProps = Required<
  Pick<DialogProps, "open" | "title" | "variant" | "size" | "drawerWidth" | "role">
> & Pick<DialogProps, "description" | "children"> & {
  titleId: string;
  descriptionId: string;
  panelRef: RefObject<HTMLDivElement | null>;
  context: DialogContextValue;
  handleKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
};

function DialogLayer({
  open,
  title,
  description,
  children,
  variant,
  size,
  drawerWidth,
  role,
  titleId,
  descriptionId,
  panelRef,
  context,
  handleKeyDown,
}: DialogLayerProps) {
  const accessibility = getDialogAccessibility(
    open,
    role,
    titleId,
    descriptionId,
    Boolean(description),
  );
  return (
    <div
      aria-hidden={open ? undefined : "true"}
      data-dialog-overlay=""
      data-state={open ? "open" : "closed"}
      className={cn(
        "fixed inset-0 z-[200] flex bg-slate-950/55 backdrop-blur-[2px]",
        "transition-[opacity,visibility] duration-[160ms] motion-reduce:transition-none",
        open
          ? "visible opacity-100 delay-0"
          : "pointer-events-none invisible opacity-0 delay-200 motion-reduce:delay-0",
        backdropVariantClasses[variant],
      )}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) context.requestClose("backdrop");
      }}
    >
      <div
        ref={panelRef}
        {...accessibility}
        data-dialog-title={title}
        data-dialog-variant={variant}
        data-state={open ? "open" : "closed"}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex w-full flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl outline-none",
          "transition-[transform,opacity] ease-out motion-reduce:transition-none motion-reduce:transform-none",
          panelVariantClasses[variant],
          panelDurationClasses[variant],
          getPanelSizeClass(variant, size),
          getDrawerWidthClass(variant, drawerWidth),
          open
            ? "translate-x-0 translate-y-0 scale-100 opacity-100"
            : panelHiddenClasses[variant],
        )}
      >
        <h2 id={titleId} className="sr-only">{title}</h2>
        {description ? <p id={descriptionId} className="sr-only">{description}</p> : null}
        <DialogContext.Provider value={context}>
          {children}
        </DialogContext.Provider>
      </div>
    </div>
  );
}

export function Dialog({
  open,
  title,
  description,
  children,
  onClose,
  variant = "modal",
  size = "md",
  drawerWidth = "default",
  dismissPolicy = "always",
  busy = false,
  role = "dialog",
  initialFocusRef,
  returnFocusRef,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const stackId = useId();
  const dismissDisabled = getDismissDisabled(dismissPolicy, busy);
  const { panelRef, requestClose, handleKeyDown } = useDialogController({
    open,
    stackId,
    dismissDisabled,
    onClose,
    initialFocusRef,
    returnFocusRef,
  });
  const context: DialogContextValue = {
    title,
    description,
    dismissDisabled,
    requestClose,
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <DialogLayer
      open={open}
      title={title}
      description={description}
      variant={variant}
      size={size}
      drawerWidth={drawerWidth}
      role={role}
      titleId={titleId}
      descriptionId={descriptionId}
      panelRef={panelRef}
      context={context}
      handleKeyDown={handleKeyDown}
    >
      {children}
    </DialogLayer>,
    document.body,
  );
}

export function DialogHeader({
  className,
  children,
  showClose = true,
  ...props
}: HTMLAttributes<HTMLElement> & { showClose?: boolean }) {
  const { title, description } = useDialogContext("DialogHeader");
  return (
    <header
      className={cn(
        "flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6",
        className,
      )}
      {...props}
    >
      <div className="min-w-0 flex-1">
        {children ?? (
          <>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </>
        )}
      </div>
      {showClose ? <DialogCloseButton /> : null}
    </header>
  );
}

export function DialogTitle({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      aria-hidden="true"
      className={cn("text-base font-semibold text-slate-950", className)}
      {...props}
    >
      {children}
    </h2>
  );
}

export function DialogDescription({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      aria-hidden="true"
      className={cn("mt-1 text-sm leading-6 text-slate-600", className)}
      {...props}
    >
      {children}
    </p>
  );
}

export const DialogBody = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function DialogBody({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6", className)}
        {...props}
      />
    );
  },
);

export function DialogFooter({
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  return (
    <footer
      className={cn(
        "grid shrink-0 grid-cols-2 gap-2 border-t border-slate-200 bg-white px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
        "[&>*:only-child]:col-span-2 [&>*:nth-child(3)]:col-span-2",
        "sm:flex sm:flex-row sm:items-center sm:justify-end sm:px-6",
        className,
      )}
      {...props}
    />
  );
}

export function DialogCloseButton({
  className,
  onClick,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { dismissDisabled, requestClose } = useDialogContext("DialogCloseButton");
  return (
    <button
      type="button"
      aria-label="Close"
      title={dismissDisabled ? "This action must finish before the dialog can close" : "Close"}
      className={cn(
        "-m-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500",
        "transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      disabled={disabled || dismissDisabled}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) requestClose("close-button");
      }}
      {...props}
    >
      <X className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
