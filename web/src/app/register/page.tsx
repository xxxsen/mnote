"use client";

import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [codeSending, setCodeSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [codeStatus, setCodeStatus] = useState("");
  const [error, setError] = useState("");
  const [properties, setProperties] = useState<Record<string, boolean> | null>(null);
  const submitRef = useRef(false);
  const codeRef = useRef(false);

  useEffect(() => {
    void apiFetch<{ properties: Record<string, boolean> }>("/properties", {
      requireAuth: false,
    }).then((response) => {
      setProperties(response.properties);
    }).catch((loadError: unknown) => {
      console.error(loadError);
      setProperties({});
    });
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((previous) => Math.max(0, previous - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitRef.current) return;
    submitRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      await apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, code }),
        requireAuth: false,
      });
      router.replace("/login?registered=true");
    } catch {
      setError("Registration failed. Check the form and verification code, then try again.");
    } finally {
      submitRef.current = false;
      setSubmitting(false);
    }
  };

  const handleSendCode = async () => {
    if (!email.trim()) {
      setError("Enter your email before requesting a verification code.");
      return;
    }
    if (codeRef.current || cooldown > 0) return;
    codeRef.current = true;
    setCodeSending(true);
    setError("");
    setCodeStatus("");
    try {
      await apiFetch("/auth/register/code", {
        method: "POST",
        body: JSON.stringify({ email }),
        requireAuth: false,
      });
      setCooldown(60);
      setCodeStatus("Verification code sent. Check your inbox.");
    } catch {
      setError("Could not send a verification code. Try again.");
    } finally {
      codeRef.current = false;
      setCodeSending(false);
    }
  };

  if (properties && (!properties.enable_user_register || !properties.enable_email_register)) {
    return (
      <AuthShell
        title="Registration unavailable"
        description="New account registration is currently disabled."
      >
        <Button type="button" className="w-full" onClick={() => router.replace("/login")}>
          Back to sign in
        </Button>
      </AuthShell>
    );
  }

  if (!properties) {
    return (
      <AuthShell title="Create an account" description="Start a private Micro Note library.">
        <div role="status" aria-busy="true" className="py-2 text-center text-sm text-muted-foreground">
          Loading registration settings…
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create an account" description="Start a private Micro Note library.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="email">Email</label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="password">Password</label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pr-10"
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "register-error" : undefined}
              required
            />
            <IconButton
              type="button"
              label={showPassword ? "Hide password" : "Show password"}
              variant="ghost"
              className="absolute right-0 top-0"
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword
                ? <EyeOff className="h-4 w-4" aria-hidden="true" />
                : <Eye className="h-4 w-4" aria-hidden="true" />}
            </IconButton>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="code">Verification code</label>
          <div className="flex gap-2">
            <Input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              required
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              onClick={() => void handleSendCode()}
              disabled={cooldown > 0 || !email.trim()}
              isLoading={codeSending}
            >
              {cooldown > 0 ? `${cooldown}s` : "Send code"}
            </Button>
          </div>
        </div>
        {codeStatus ? (
          <p role="status" className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm">
            {codeStatus}
          </p>
        ) : null}
        {error ? (
          <p id="register-error" role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" isLoading={submitting}>
          Create account
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
