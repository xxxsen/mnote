"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { PageState } from "@/components/ui/page-state";
import { apiFetch, setAuthEmail, setAuthToken } from "@/lib/api";
import { getSafeInternalReturn } from "@/lib/navigation";

function OAuthLoading() {
  return (
    <AuthShell title="Completing sign in" description="Verifying your provider account.">
      <PageState compact kind="loading" title="Completing sign in…" />
    </AuthShell>
  );
}

function OAuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");
  const [exchangeError, setExchangeError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    const storedReturn = sessionStorage.getItem("mnote_oauth_return");
    sessionStorage.removeItem("mnote_oauth_return");
    const returnTo = getSafeInternalReturn(searchParams.get("return") ?? storedReturn);
    let cancelled = false;

    void apiFetch<{ token: string; email?: string }>("/auth/oauth/exchange", {
      method: "POST",
      body: JSON.stringify({ code }),
      requireAuth: false,
    }).then((response) => {
      if (cancelled) return;
      setAuthToken(response.token);
      if (response.email) setAuthEmail(response.email);
      router.replace(returnTo);
    }).catch(() => {
      if (!cancelled) setExchangeError("invalid");
    });

    return () => {
      cancelled = true;
    };
  }, [code, router, searchParams]);

  const error = errorParam || exchangeError || (code ? null : "invalid");
  if (!error) return <OAuthLoading />;

  const message = error === "conflict"
    ? "This email already exists. Sign in with your password, then connect the provider in Account settings."
    : "The provider could not complete sign in. Start again from the sign-in page.";

  return (
    <AuthShell title="OAuth sign in failed" description={message}>
      <div className="space-y-3">
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Your account was not changed.
        </div>
        <Button type="button" className="w-full" onClick={() => router.replace("/login")}>
          Back to sign in
        </Button>
      </div>
    </AuthShell>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={<OAuthLoading />}>
      <OAuthCallbackContent />
    </Suspense>
  );
}
