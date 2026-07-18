"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export type DialogStatusProps = HTMLAttributes<HTMLDivElement> & {
  variant: "loading" | "error" | "success" | "info";
};

function renderStatusIcon(variant: DialogStatusProps["variant"]): ReactNode {
  const className = "mt-0.5 h-4 w-4 shrink-0";
  if (variant === "loading") {
    return <Loader2 className={`${className} animate-spin`} aria-hidden="true" />;
  }
  if (variant === "error") {
    return <AlertCircle className={className} aria-hidden="true" />;
  }
  if (variant === "success") {
    return <CheckCircle2 className={className} aria-hidden="true" />;
  }
  return <Info className={className} aria-hidden="true" />;
}

export function DialogStatus({
  variant,
  className,
  children,
  ...props
}: DialogStatusProps) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
      className={cn(
        "flex items-start gap-2 rounded-xl border px-3 py-2 text-sm",
        variant === "error" && "border-red-200 bg-red-50 text-red-700",
        variant === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        variant === "loading" && "border-slate-200 bg-slate-50 text-slate-600",
        variant === "info" && "border-blue-200 bg-blue-50 text-blue-700",
        className,
      )}
      {...props}
    >
      {renderStatusIcon(variant)}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
