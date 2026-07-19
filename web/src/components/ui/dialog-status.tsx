"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

export type DialogStatusProps = HTMLAttributes<HTMLDivElement> & {
  variant: "loading" | "error" | "success" | "info" | "warning";
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
  if (variant === "warning") {
    return <TriangleAlert className={className} aria-hidden="true" />;
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
        variant === "error" && "border-destructive/30 bg-destructive/10 text-destructive",
        variant === "success" && "border-success/30 bg-success/10 text-success",
        variant === "warning" && "border-warning/30 bg-warning/10 text-warning",
        variant === "loading" && "border-border bg-muted text-muted-foreground",
        variant === "info" && "border-info/30 bg-info/10 text-info",
        className,
      )}
      {...props}
    >
      {renderStatusIcon(variant)}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
