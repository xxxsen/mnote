"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api";
import { Github, Chrome, Link2, Unlink } from "lucide-react";

type BindingItem = {
  provider: "github" | "google";
  email?: string;
};

type ProviderStatus = {
  bound: boolean;
  email?: string;
};

export default function SettingsPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [bindings, setBindings] = useState<Record<string, ProviderStatus>>({});
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const returnTo = useMemo(() => {
    const target = searchParams.get("return") || "/docs";
    return target.startsWith("/") ? target : "/docs";
  }, [searchParams]);

  const fetchBindings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ bindings: BindingItem[] }>("/auth/oauth/bindings");
      const next: Record<string, ProviderStatus> = {
        github: { bound: false },
        google: { bound: false },
      };
      (res?.bindings || []).forEach((item) => {
        next[item.provider] = { bound: true, email: item.email };
      });
      setBindings(next);
    } catch (err) {
      console.error(err);
      toast({ description: "Failed to load bindings", variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchBindings();
  }, [fetchBindings]);

  useEffect(() => {
    const status = searchParams.get("oauth");
    const provider = searchParams.get("provider");
    if (!status) return;
    if (status === "bound") {
      toast({ description: `${provider || "Provider"} bound successfully.` });
      fetchBindings();
      return;
    }
    if (status === "conflict") {
      toast({ description: "This provider is already linked to another account.", variant: "error" });
      return;
    }
    if (status === "error") {
      toast({ description: "Failed to bind provider.", variant: "error" });
    }
  }, [fetchBindings, searchParams, toast]);

  const startBind = async (provider: "github" | "google") => {
    try {
      const res = await apiFetch<{ url: string }>(`/auth/oauth/${provider}/bind/url?return=${encodeURIComponent(returnTo)}`);
      window.location.href = res.url;
    } catch (err) {
      console.error(err);
      toast({ description: "Failed to start binding", variant: "error" });
    }
  };

  const unbind = async (provider: "github" | "google") => {
    try {
      await apiFetch(`/auth/oauth/${provider}/bind`, { method: "DELETE" });
      fetchBindings();
    } catch (err) {
      console.error(err);
      toast({ description: "Failed to unbind provider", variant: "error" });
    }
  };

  const updatePassword = async () => {
    if (!newPassword.trim()) {
      toast({ description: "Please enter a new password.", variant: "error" });
      return;
    }
    setSavingPassword(true);
    try {
      await apiFetch("/auth/password", {
        method: "PUT",
        body: JSON.stringify({
          current_password: currentPassword || undefined,
          password: newPassword,
        }),
      });
      toast({ description: "Password updated." });
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      console.error(err);
      toast({ description: "Failed to update password.", variant: "error" });
    } finally {
      setSavingPassword(false);
    }
  };

  const providers = [
    { key: "github" as const, label: "GitHub", icon: Github },
    { key: "google" as const, label: "Google", icon: Chrome },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/40 via-background to-background text-foreground">
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Account</div>
              <div className="text-3xl font-bold tracking-tight mt-2">Account Settings</div>
              <div className="text-sm text-muted-foreground mt-1">Connect providers and manage your security options.</div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => router.push(returnTo)}>Back to Docs</Button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Connected Accounts</div>
                <div className="text-xs text-muted-foreground">Link providers for quick sign in.</div>
              </div>
            </div>
            <div className="border border-border rounded-2xl bg-card shadow-sm overflow-hidden">
              {providers.map(({ key, label, icon: Icon }) => {
                const status = bindings[key] || { bound: false };
                return (
                  <div key={key} className="flex items-center justify-between gap-4 px-4 py-4 border-b border-border/70 last:border-b-0">
                    <div className="flex items-center gap-3">
                      <div className={`h-11 w-11 rounded-xl border border-border flex items-center justify-center ${
                        status.bound ? "bg-primary/10 text-primary" : "bg-muted"
                      }`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-medium">{label}</div>
                        <div className="text-xs text-muted-foreground">
                          {status.bound ? `Linked${status.email ? ` as ${status.email}` : ""}` : "Not linked"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`h-2.5 w-2.5 rounded-full ${
                        status.bound ? "bg-emerald-500" : "bg-amber-400"
                      }`} aria-hidden />
                      {loading ? (
                        <Button variant="outline" disabled className="h-9 w-9 p-0" aria-label="Loading">
                          <span className="text-xs">...</span>
                        </Button>
                      ) : status.bound ? (
                        <Button
                          variant="outline"
                          onClick={() => unbind(key)}
                          className="h-9 w-9 p-0"
                          aria-label={`Unbind ${label}`}
                          title={`Unbind ${label}`}
                        >
                          <Unlink className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          onClick={() => startBind(key)}
                          className="h-9 w-9 p-0"
                          aria-label={`Bind ${label}`}
                          title={`Bind ${label}`}
                        >
                          <Link2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-sm font-semibold">Security</div>
              <div className="text-xs text-muted-foreground">Keep your account protected.</div>
            </div>
            <div className="border border-border rounded-2xl bg-card p-5 shadow-sm space-y-4">
              <div>
                <div className="font-medium">Password</div>
                <div className="text-xs text-muted-foreground mt-1">Leave current password blank if you signed up with OAuth.</div>
              </div>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Current password</label>
                  <Input
                    type="password"
                    placeholder="Current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">New password</label>
                  <Input
                    type="password"
                    placeholder="New password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Button onClick={updatePassword} disabled={savingPassword} className="w-full">
                  {savingPassword ? "Saving..." : "Update Password"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
