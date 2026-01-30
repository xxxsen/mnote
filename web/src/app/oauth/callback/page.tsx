"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { setAuthEmail, setAuthToken } from "@/lib/api";

export default function OAuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const email = searchParams.get("email");
  const errorParam = searchParams.get("error");
  const returnTo = searchParams.get("return") || "/docs";

  useEffect(() => {
    if (token) {
      setAuthToken(token);
      if (email) {
        setAuthEmail(email);
      }
      router.replace(returnTo);
    }
  }, [email, returnTo, router, token]);

  const error = errorParam || (token ? null : "invalid");

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
