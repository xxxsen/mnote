"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAuthToken } from "@/lib/api";
import { PageState } from "@/components/ui/page-state";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      router.replace("/docs");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return (
    <main className="flex min-h-dvh items-center justify-center" aria-label="Opening Micro Note">
      <PageState kind="loading" title="Opening Micro Note…" compact />
    </main>
  );
}
