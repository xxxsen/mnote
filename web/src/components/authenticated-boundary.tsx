"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { getAuthToken } from "@/lib/api";
import { PageState } from "@/components/ui/page-state";
import { getSafeInternalReturn } from "@/lib/navigation";

const subscribeToken = (notify: () => void) => {
  window.addEventListener("storage", notify);
  window.addEventListener("mnote-auth-change", notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener("mnote-auth-change", notify);
  };
};

export function AuthenticatedBoundary({ children }: { children: ReactNode }) {
  const router = useRouter();
  const token = useSyncExternalStore<string | null | undefined>(
    subscribeToken,
    getAuthToken,
    () => undefined,
  );

  useEffect(() => {
    if (token !== null) return;
    const current = getSafeInternalReturn(
      `${window.location.pathname}${window.location.search}`,
      "/docs",
    );
    router.replace(`/login?return=${encodeURIComponent(current)}`);
  }, [router, token]);

  if (!token) {
    return (
      <main className="flex min-h-dvh items-center justify-center" aria-label="Authentication check">
        <PageState kind="loading" title="Checking your session…" compact />
      </main>
    );
  }

  return children;
}
