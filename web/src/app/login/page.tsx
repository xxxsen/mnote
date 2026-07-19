"use client";

import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { AuthShell } from "@/components/auth-shell";
import { GithubIcon, GoogleIcon } from "@/components/brand-icons";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { PageState } from "@/components/ui/page-state";
import { apiFetch, setAuthEmail, setAuthToken } from "@/lib/api";
import { getSafeInternalReturn } from "@/lib/navigation";

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

function LoginBanner({ banner }: { banner: BannerConfig | null }) {
  if (!banner?.enable || (!banner.title && !banner.wording)) return null;
  return (
    <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground">
      {banner.title ? <p className="text-xs font-semibold">{banner.title}</p> : null}
      {banner.wording ? (
        banner.redirect ? (
          <a
            href={banner.redirect}
            className="mt-1 inline-block text-sm text-primary underline underline-offset-4"
            target="_blank"
            rel="noreferrer"
          >
            {banner.wording}
          </a>
        ) : <p className="mt-1">{banner.wording}</p>
      ) : null}
    </div>
  );
}

function OAuthButtons({
  properties,
  pending,
  onOAuth,
}: {
  properties: Properties | null;
  pending: "github" | "google" | null;
  onOAuth: (provider: "github" | "google") => void;
}) {
  if (!properties?.enable_github_oauth && !properties?.enable_google_oauth) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        Or continue with
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {properties.enable_github_oauth ? (
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => onOAuth("github")}
            disabled={pending !== null}
            isLoading={pending === "github"}
          >
            <GithubIcon className="h-4 w-4" aria-hidden="true" />
            GitHub
          </Button>
        ) : null}
        {properties.enable_google_oauth ? (
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={() => onOAuth("google")}
            disabled={pending !== null}
            isLoading={pending === "google"}
          >
            <GoogleIcon className="h-4 w-4" aria-hidden="true" />
            Google
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = getSafeInternalReturn(searchParams.get("return"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [oauthLoading, setOauthLoading] = useState<"github" | "google" | null>(null);
  const [properties, setProperties] = useState<Properties | null>(null);
  const [banner, setBanner] = useState<BannerConfig | null>(null);
  const submitRef = useRef(false);
  const oauthRef = useRef(false);

  useEffect(() => {
    void apiFetch<{ properties: Properties; banner?: BannerConfig }>("/properties", {
      requireAuth: false,
    }).then((response) => {
      setProperties(response.properties);
      setBanner(response.banner ?? null);
    }).catch((loadError: unknown) => {
      console.error(loadError);
      setProperties({});
      setBanner(null);
    });
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitRef.current) return;
    submitRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const response = await apiFetch<{ token: string; user: { email: string } }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
        requireAuth: false,
      });
      setAuthToken(response.token);
      setAuthEmail(response.user.email);
      router.replace(returnTo);
    } catch {
      setError("Sign in failed. Check your email and password, then try again.");
    } finally {
      submitRef.current = false;
      setSubmitting(false);
    }
  };

  const handleOAuth = async (provider: "github" | "google") => {
    if (oauthRef.current) return;
    oauthRef.current = true;
    setOauthLoading(provider);
    setError("");
    try {
      sessionStorage.setItem("mnote_oauth_return", returnTo);
      const response = await apiFetch<{ url: string }>(`/auth/oauth/${provider}/url`, {
        requireAuth: false,
      });
      window.location.assign(response.url);
    } catch {
      setError(`Could not start ${provider === "github" ? "GitHub" : "Google"} sign in. Try again.`);
      oauthRef.current = false;
      setOauthLoading(null);
    }
  };

  const status = searchParams.get("registered") === "true" ? (
    <div role="status" className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm">
      Account created. Sign in to continue.
    </div>
  ) : null;

  return (
    <AuthShell title="Sign in" description="Continue to your notes." status={status}>
      <div className="space-y-5">
        <LoginBanner banner={banner} />
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
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="pr-10"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? "login-error" : undefined}
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
          {error ? (
            <div id="login-error" role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}
          <Button type="submit" className="w-full" isLoading={submitting}>
            Sign in
          </Button>
        </form>
        <OAuthButtons properties={properties} pending={oauthLoading} onOAuth={handleOAuth} />
        {properties?.enable_user_register && properties.enable_email_register ? (
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">Create one</Link>
          </p>
        ) : null}
      </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={(
        <PageState
          kind="loading"
          title="Loading sign in"
          description="Preparing the sign-in form."
          className="min-h-dvh"
        />
      )}
    >
      <LoginContent />
    </Suspense>
  );
}
