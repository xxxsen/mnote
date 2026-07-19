import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function ReadingSurface({
  children,
  className,
  as: Component = "article",
}: {
  children: ReactNode;
  className?: string;
  as?: "article" | "section" | "div";
}) {
  return (
    <Component
      className={cn(
        "mx-auto w-full max-w-4xl overflow-x-auto rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6 lg:p-8",
        "[&_pre]:max-w-full [&_pre]:overflow-x-auto [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto",
        "[&_a]:break-words",
        className,
      )}
    >
      {children}
    </Component>
  );
}
