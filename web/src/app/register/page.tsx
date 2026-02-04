"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [codeSending, setCodeSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [properties, setProperties] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    const loadProperties = async () => {
      try {
        const res = await apiFetch<{ properties: Record<string, boolean> }>("/properties", { requireAuth: false });
        setProperties(res?.properties || {});
      } catch (err) {
        console.error(err);
        setProperties({});
      }
    };
    loadProperties();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      await apiFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, code }),
        requireAuth: false,
      });

      router.push("/login?registered=true");
    } catch (err: unknown) {
      const message = err instanceof ApiError ? `${err.message} (Code: ${err.code})` : (err instanceof Error ? err.message : "Registration failed");
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendCode = async () => {
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    if (cooldown > 0) return;
    setCodeSending(true);
    setError("");
    try {
      await apiFetch("/auth/register/code", {
        method: "POST",
        body: JSON.stringify({ email }),
        requireAuth: false,
      });
      setCooldown(60);
    } catch (err: unknown) {
      const message = err instanceof ApiError ? `${err.message} (Code: ${err.code})` : (err instanceof Error ? err.message : "Failed to send code");
      setError(message);
    } finally {
      setCodeSending(false);
    }
  };

  if (properties && (!properties.enable_user_register || !properties.enable_email_register)) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-sm border border-border bg-card p-8 shadow-sm text-center space-y-3">
          <div className="text-lg font-semibold">Registration Disabled</div>
          <div className="text-sm text-muted-foreground">New user registration is currently closed.</div>
          <Button onClick={() => router.push("/login")}>Back to Login</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm border border-border bg-card p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center mb-2">
            <h1 className="text-2xl font-bold font-mono tracking-tighter">Micro Note</h1>
          </div>
          <p className="text-muted-foreground text-sm">Create an account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase text-muted-foreground" htmlFor="email">
              Email
            </label>
            <Input
              id="email"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase text-muted-foreground" htmlFor="password">
              Password
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase text-muted-foreground" htmlFor="code">
              Verification Code
            </label>
            <div className="flex gap-2">
              <Input
                id="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6-digit code"
                required
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleSendCode}
                disabled={codeSending || cooldown > 0 || !email.trim()}
              >
                {cooldown > 0 ? `${cooldown}s` : (codeSending ? "Sending..." : "Send")}
              </Button>
            </div>
          </div>

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-2 border border-destructive/20">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" isLoading={isLoading}>
            Register
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="underline underline-offset-4 hover:text-primary">
            Login
          </Link>
        </div>
      </div>
    </div>
  );
}
