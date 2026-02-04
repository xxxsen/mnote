"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, setAuthEmail, setAuthToken, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chrome, Github } from "lucide-react";

type Properties = {
  enable_github_oauth?: boolean;
  enable_google_oauth?: boolean;
  enable_user_register?: boolean;
  enable_email_register?: boolean;
};

type BannerConfig = {
  enable?: boolean;
  title?: string;
  wording?: string;
  redirect?: string;
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const [properties, setProperties] = useState<Properties | null>(null);
  const [banner, setBanner] = useState<BannerConfig | null>(null);

  useEffect(() => {
    const loadProperties = async () => {
      try {
        const res = await apiFetch<{ properties: Properties; banner?: BannerConfig }>("/properties", { requireAuth: false });
        setProperties(res?.properties || {});
        setBanner(res?.banner || null);
      } catch (err) {
        console.error(err);
        setProperties({});
        setBanner(null);
      }
    };
    loadProperties();
  }, []);

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
      const message = err instanceof ApiError ? `${err.message} (Code: ${err.code})` : (err instanceof Error ? err.message : "Login failed");
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
      const message = err instanceof ApiError ? `${err.message} (Code: ${err.code})` : (err instanceof Error ? err.message : "OAuth login failed");
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

        {banner?.enable && (banner.title || banner.wording) && (
          <div className="mb-6 rounded-lg border border-amber-200/60 bg-amber-50/70 px-3 py-2 text-amber-900">
            {banner.title && (
              <div className="text-[10px] font-semibold uppercase tracking-wider">{banner.title}</div>
            )}
            {banner.wording && (
              banner.redirect ? (
                <a
                  href={banner.redirect}
                  className="text-sm underline underline-offset-4 hover:text-amber-700"
                  target="_blank"
                  rel="noreferrer"
                >
                  {banner.wording}
                </a>
              ) : (
                <div className="text-sm">{banner.wording}</div>
              )
            )}
          </div>
        )}

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

        {(properties?.enable_github_oauth || properties?.enable_google_oauth) && (
          <div className="mt-6 flex items-center justify-center gap-3">
            {properties?.enable_github_oauth && (
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
            )}
            {properties?.enable_google_oauth && (
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
            )}
          </div>
        )}

        {properties?.enable_user_register && properties?.enable_email_register && (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="underline underline-offset-4 hover:text-primary">
              Register
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
