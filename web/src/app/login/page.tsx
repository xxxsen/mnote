"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, setAuthEmail, setAuthToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chrome, Github } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const res = await apiFetch<{ token: string; user: { email: string } }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
        requireAuth: false,
      });

      setAuthToken(res.token);
      setAuthEmail(res.user.email);
      router.push("/docs");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOAuth = async (provider: "github" | "google") => {
    setOauthLoading(provider);
    setError("");
    try {
      const res = await apiFetch<{ url: string }>(`/auth/oauth/${provider}/url`, {
        requireAuth: false,
      });
      window.location.href = res.url;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "OAuth login failed";
      setError(message);
      setOauthLoading(null);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm border border-border bg-card p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center mb-2">
            <h1 className="text-2xl font-bold font-mono tracking-tighter">Micro Note</h1>
          </div>
          <p className="text-muted-foreground text-sm">Enter your credentials</p>
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

          {error && (
            <div className="bg-destructive/10 text-destructive text-sm p-2 border border-destructive/20">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" isLoading={isLoading}>
            Login
          </Button>
        </form>

        <div className="mt-6 flex items-center justify-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-10 w-10 rounded-full p-0"
            onClick={() => handleOAuth("github")}
            disabled={oauthLoading !== null}
            aria-label="Continue with GitHub"
            title={oauthLoading === "github" ? "Connecting..." : "Continue with GitHub"}
          >
            <Github className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 w-10 rounded-full p-0"
            onClick={() => handleOAuth("google")}
            disabled={oauthLoading !== null}
            aria-label="Continue with Google"
            title={oauthLoading === "google" ? "Connecting..." : "Continue with Google"}
          >
            <Chrome className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="underline underline-offset-4 hover:text-primary">
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}
