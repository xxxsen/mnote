"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

import { ApiError } from "@/lib/api";

type ToastVariant = "default" | "success" | "error";

type ToastInput = {
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
};

type ToastContextValue = {
  toast: (input: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Record<string, number>>({});

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
    const timer = timers.current[id];
    if (timer) {
      window.clearTimeout(timer);
      delete timers.current[id];
    }
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let description = "";
      if (typeof input.description === "string") {
        description = input.description;
      } else if (input.description instanceof ApiError) {
        description = `${input.description.message} (Code: ${input.description.code})`;
      } else if (input.description instanceof Error) {
        description = input.description.message;
      }

      const item: ToastItem = {
        id,
        title: input.title,
        description,
        variant: input.variant || "default",
        duration: input.duration ?? 3200,
      };
      setToasts((prev) => [...prev, item]);
      timers.current[id] = window.setTimeout(() => remove(id), item.duration);
    },
    [remove]
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-[200] flex w-[320px] max-w-[92vw] flex-col gap-2">
        {toasts.map((item) => {
          const variantClass =
            item.variant === "error"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : item.variant === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
              : "border-border bg-background text-foreground";
          return (
            <div
              key={item.id}
              className={`rounded-xl border px-4 py-3 text-sm shadow-lg backdrop-blur-sm ${variantClass}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  {item.title ? <div className="text-xs font-semibold uppercase tracking-wide">{item.title}</div> : null}
                  <div className="leading-relaxed">{item.description}</div>
                </div>
                <button
                  type="button"
                  className="text-xs opacity-60 hover:opacity-100"
                  onClick={() => remove(item.id)}
                >
                  ✕
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
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
