import { AlertCircle, Inbox, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "./button";
import { cn } from "@/lib/utils";

type PageStateProps = {
  kind: "loading" | "empty" | "error";
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  icon?: ReactNode;
  className?: string;
};

export function PageState({
  kind,
  title,
  description,
  actionLabel,
  onAction,
  compact = false,
  icon,
  className,
}: PageStateProps) {
  const defaultIcon = kind === "loading"
    ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
    : kind === "error"
      ? <AlertCircle className="h-5 w-5" aria-hidden="true" />
      : <Inbox className="h-5 w-5" aria-hidden="true" />;
  const role = kind === "error" ? "alert" : "status";

  return (
    <div
      role={role}
      aria-busy={kind === "loading" || undefined}
      className={cn(
        "flex w-full flex-col items-center justify-center text-center",
        compact ? "gap-2 px-4 py-8" : "min-h-64 gap-3 px-6 py-16",
        className,
      )}
    >
      <div className={cn(
        "flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground",
        kind === "error" && "bg-destructive/10 text-destructive",
      )}>
        {icon ?? defaultIcon}
      </div>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actionLabel && onAction ? (
        <Button type="button" variant={kind === "error" ? "outline" : "default"} onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
