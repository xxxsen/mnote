"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiFetch, ApiError, setAuthEmail, setAuthToken } from "@/lib/api";

function OAuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");
  const [exchangeError, setExchangeError] = useState<string | null>(null);
  const returnTo = getSafeReturn(searchParams.get("return")) || "/docs";

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    const exchange = async () => {
      try {
        const res = await apiFetch<{ token: string; email?: string }>("/auth/oauth/exchange", {
          method: "POST",
          body: JSON.stringify({ code }),
          requireAuth: false,
        });
        if (cancelled) return;
        setAuthToken(res.token);
        if (res.email) {
          setAuthEmail(res.email);
        }
        router.replace(returnTo);
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : "invalid";
        setExchangeError(message || "invalid");
      }
    };
    exchange();
    return () => {
      cancelled = true;
    };
  }, [code, returnTo, router]);

  const error = errorParam || exchangeError || (code ? null : "invalid");

  if (!error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground">
        Completing sign in...
      </div>
    );
  }

  const message =
    error === "conflict"
      ? "This email already exists. Please log in with password and bind the provider in settings."
      : "OAuth sign in failed. Please try again.";

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md border border-border bg-card p-6 shadow-sm space-y-4">
        <div>
          <div className="text-lg font-semibold">OAuth Login Error</div>
          <div className="text-sm text-muted-foreground mt-1">{message}</div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => router.push("/login")}>Back to Login</Button>
          <Button variant="outline" onClick={() => router.push("/settings")}>Account Settings</Button>
        </div>
      </div>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center p-6 text-sm text-muted-foreground">
        Completing sign in...
      </div>
    }>
      <OAuthCallbackContent />
    </Suspense>
  );
}

function getSafeReturn(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  return value;
}
