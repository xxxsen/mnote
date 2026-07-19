"use client";

import Link from "next/link";
import { ArrowLeft, Menu as MenuIcon } from "lucide-react";
import {
  useRef,
  useState,
  type ReactNode,
} from "react";

import { AppNavigationDrawer } from "./app-navigation";
import { IconButton } from "./ui/icon-button";
import { cn } from "@/lib/utils";

type AppPageProps = {
  title: string;
  description?: string;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  width?: "content" | "wide";
  backHref?: string;
  onBack?: () => void;
  onNavigateRequest?: (href: string) => void;
  children: ReactNode;
  className?: string;
};

export function AppPage({
  title,
  description,
  primaryAction,
  secondaryActions,
  width = "content",
  backHref = "/docs",
  onBack,
  onNavigateRequest,
  children,
  className,
}: AppPageProps) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 min-h-14 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex min-h-14 w-full max-w-[1440px] flex-wrap items-center gap-2 px-4 sm:px-6 lg:px-8">
          <IconButton
            ref={menuButtonRef}
            label="Open application navigation"
            variant="ghost"
            className="md:hidden"
            expanded={navigationOpen}
            onClick={() => setNavigationOpen(true)}
          >
            <MenuIcon className="h-5 w-5" aria-hidden="true" />
          </IconButton>
          {onBack ? (
            <IconButton label="Back to notes" variant="ghost" className="hidden md:inline-flex" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </IconButton>
          ) : (
            <Link
              href={backHref}
              aria-label="Back to notes"
              className="hidden h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:inline-flex"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Link>
          )}
          <div className="min-w-0 flex-1 py-2">
            <h1 className="truncate text-xl font-semibold leading-7">{title}</h1>
            {description ? <p className="truncate text-xs text-muted-foreground">{description}</p> : null}
          </div>
          {secondaryActions ? (
            <div className="order-3 flex w-full items-center justify-end gap-2 pb-2 sm:order-none sm:w-auto sm:pb-0">
              {secondaryActions}
            </div>
          ) : null}
          {primaryAction ? <div className="flex items-center gap-2">{primaryAction}</div> : null}
        </div>
      </header>
      <main
        aria-label={title}
        className={cn(
          "mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8",
          width === "wide" ? "max-w-6xl" : "max-w-3xl",
          className,
        )}
      >
        {children}
      </main>
      <AppNavigationDrawer
        open={navigationOpen}
        onClose={() => setNavigationOpen(false)}
        returnFocusRef={menuButtonRef}
        onNavigateRequest={onNavigateRequest}
      />
    </div>
  );
}
