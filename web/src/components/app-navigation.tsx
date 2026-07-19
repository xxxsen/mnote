"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  CalendarDays,
  FileText,
  Settings,
  Share2,
  Star,
  Tags,
  LayoutTemplate,
} from "lucide-react";
import { useRef } from "react";

import { Dialog, DialogBody, DialogHeader } from "./ui/dialog";

export const APP_NAVIGATION = [
  { href: "/docs", label: "All Notes", icon: FileText },
  { href: "/docs?view=starred", label: "Starred", icon: Star },
  { href: "/docs?view=shared", label: "Shared", icon: Share2 },
  { href: "/todos", label: "Tasks", icon: CalendarDays },
  { href: "/templates", label: "Templates", icon: LayoutTemplate },
  { href: "/assets", label: "Assets", icon: Archive },
  { href: "/tags", label: "Tags", icon: Tags },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function isCurrentPath(pathname: string, href: string) {
  const target = href.split("?")[0];
  if (target === "/docs") return pathname === "/docs";
  return pathname === target || pathname.startsWith(`${target}/`);
}

export function AppNavigationLinks({
  onNavigate,
  onNavigateRequest,
  activeHref,
}: {
  onNavigate?: () => void;
  onNavigateRequest?: (href: string) => void;
  activeHref?: string;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Application" className="space-y-1">
      {APP_NAVIGATION.map(({ href, label, icon: Icon }) => {
        const current = activeHref ? activeHref === href : isCurrentPath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            onClick={(event) => {
              if (onNavigateRequest) {
                event.preventDefault();
                onNavigateRequest(href);
              }
              onNavigate?.();
            }}
            className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors ${
              current
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppNavigationDrawer({
  open,
  onClose,
  returnFocusRef,
  onNavigateRequest,
  activeHref,
  children,
}: {
  open: boolean;
  onClose: () => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  onNavigateRequest?: (href: string) => void;
  activeHref?: string;
  children?: React.ReactNode;
}) {
  const initialFocusRef = useRef<HTMLAnchorElement>(null);
  return (
    <Dialog
      open={open}
      title="Application navigation"
      variant="drawer"
      drawerWidth="compact"
      onClose={onClose}
      initialFocusRef={initialFocusRef}
      returnFocusRef={returnFocusRef}
    >
      <DialogHeader />
      <DialogBody className="space-y-6 p-4">
        <div className="text-lg font-semibold">Micro Note</div>
        <AppNavigationLinks
          onNavigate={onClose}
          onNavigateRequest={onNavigateRequest}
          activeHref={activeHref}
        />
        {children}
      </DialogBody>
    </Dialog>
  );
}
