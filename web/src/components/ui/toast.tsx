"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ApiError } from "@/lib/api";

export type ToastVariant = "default" | "success" | "error";

export type ToastInput = {
  title?: string;
  description: string | ApiError | Error;
  variant?: ToastVariant;
  duration?: number;
};

type ToastItem = {
  id: string;
  title?: string;
  description: string;
  variant: ToastVariant;
  duration: number;
  createdAt: number;
};

type TimerState = {
  timer: number | null;
  remaining: number;
  startedAt: number;
};

type ToastContextValue = {
  toast: (input: ToastInput) => void;
};

const MAX_TOASTS = 3;
const DEDUPE_WINDOW_MS = 1000;
const ToastContext = createContext<ToastContextValue | null>(null);

function getDescription(value: ToastInput["description"]) {
  if (typeof value === "string") return value;
  if (value instanceof ApiError) return value.message;
  return value.message;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastsRef = useRef<ToastItem[]>([]);
  const timers = useRef<Partial<Record<string, TimerState>>>({});

  const updateToasts = useCallback((update: (items: ToastItem[]) => ToastItem[]) => {
    const next = update(toastsRef.current);
    toastsRef.current = next;
    setToasts(next);
  }, []);

  const clearTimer = useCallback((id: string) => {
    const state = timers.current[id];
    if (!state) return;
    if (state.timer !== null) window.clearTimeout(state.timer);
    delete timers.current[id];
  }, []);

  const remove = useCallback((id: string) => {
    updateToasts((previous) => previous.filter((item) => item.id !== id));
    clearTimer(id);
  }, [clearTimer, updateToasts]);

  const schedule = useCallback((id: string, duration: number) => {
    clearTimer(id);
    timers.current[id] = {
      timer: window.setTimeout(() => remove(id), duration),
      remaining: duration,
      startedAt: Date.now(),
    };
  }, [clearTimer, remove]);

  const pause = useCallback((id: string) => {
    const state = timers.current[id];
    if (!state) return;
    if (state.timer !== null) window.clearTimeout(state.timer);
    state.remaining = Math.max(0, state.remaining - (Date.now() - state.startedAt));
    state.timer = null;
  }, []);

  const resume = useCallback((id: string) => {
    const state = timers.current[id];
    if (!state || state.timer !== null) return;
    const remaining = Math.max(250, state.remaining);
    state.startedAt = Date.now();
    state.timer = window.setTimeout(() => remove(id), remaining);
  }, [remove]);

  const toast = useCallback((input: ToastInput) => {
    const description = getDescription(input.description);
    const variant = input.variant ?? "default";
    const duration = input.duration ?? 3200;
    const now = Date.now();
    const duplicate = toastsRef.current.find(
      (item) => item.variant === variant
        && item.description === description
        && now - item.createdAt <= DEDUPE_WINDOW_MS,
    );

    if (duplicate) {
      updateToasts((previous) => previous.map((item) => (
        item.id === duplicate.id ? { ...item, title: input.title, duration, createdAt: now } : item
      )));
      schedule(duplicate.id, duration);
      return;
    }

    const item: ToastItem = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      title: input.title,
      description,
      variant,
      duration,
      createdAt: now,
    };
    const dropped = toastsRef.current.slice(0, Math.max(0, toastsRef.current.length - MAX_TOASTS + 1));
    dropped.forEach((entry) => clearTimer(entry.id));
    updateToasts((previous) => [...previous.slice(-(MAX_TOASTS - 1)), item]);
    schedule(item.id, duration);
  }, [clearTimer, schedule, updateToasts]);

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      Object.values(activeTimers).forEach((state) => {
        if (state?.timer !== null && state?.timer !== undefined) {
          window.clearTimeout(state.timer);
        }
      });
      Object.keys(activeTimers).forEach((id) => delete activeTimers[id]);
    };
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-label="Notifications"
        className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[300] flex max-w-[calc(100vw-2rem)] flex-col gap-2 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:w-[320px]"
      >
        {toasts.map((item) => {
          const variantClass =
            item.variant === "error"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : item.variant === "success"
                ? "border-success/40 bg-success/10 text-success"
                : "border-border bg-background text-foreground";
          return (
            <div
              key={item.id}
              role={item.variant === "error" ? "alert" : "status"}
              aria-live={item.variant === "error" ? "assertive" : "polite"}
              onMouseEnter={() => pause(item.id)}
              onMouseLeave={() => resume(item.id)}
              onFocusCapture={() => pause(item.id)}
              onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) resume(item.id);
              }}
              className={`rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur-sm ${variantClass}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  {item.title ? <div className="text-xs font-semibold">{item.title}</div> : null}
                  <div className="break-words leading-relaxed">{item.description}</div>
                </div>
                <button
                  type="button"
                  aria-label="Dismiss notification"
                  title="Dismiss"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md opacity-60 hover:bg-current/10 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
                  onClick={() => remove(item.id)}
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider");
  return context;
}
