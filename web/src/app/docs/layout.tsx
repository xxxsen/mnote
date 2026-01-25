"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { getAuthToken } from "@/lib/api";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  const token = useSyncExternalStore(
    (notify) => {
      if (typeof window === "undefined") return () => {};
      window.addEventListener("storage", notify);
      return () => window.removeEventListener("storage", notify);
    },
    () => getAuthToken(),
    () => null
  );

  useEffect(() => {
    if (!token) {
      const current = getAuthToken();
      if (current) return;
      router.push("/login");
    }
  }, [router, token]);

  if (!token) {
    return null;
  }

  return <>{children}</>;
}
