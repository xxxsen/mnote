"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { apiFetch } from "@/lib/api";
import { Github, Chrome } from "lucide-react";

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
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-2xl font-bold">Account Settings</div>
            <div className="text-sm text-muted-foreground">Manage linked OAuth providers.</div>
          </div>
          <Button variant="outline" onClick={() => router.push(returnTo)}>Back to Docs</Button>
        </div>

        <div className="border border-border rounded-lg divide-y divide-border bg-card">
          {providers.map(({ key, label, icon: Icon }) => {
            const status = bindings[key] || { bound: false };
            return (
              <div key={key} className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full border border-border flex items-center justify-center bg-muted">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-medium">{label}</div>
                    <div className="text-xs text-muted-foreground">
                      {status.bound ? `Linked${status.email ? ` as ${status.email}` : ""}` : "Not linked"}
                    </div>
                  </div>
                </div>
                <div>
                  {loading ? (
                    <Button variant="outline" disabled>Loading...</Button>
                  ) : status.bound ? (
                    <Button variant="outline" onClick={() => unbind(key)}>Unbind</Button>
                  ) : (
                    <Button onClick={() => startBind(key)}>Bind</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="border border-border rounded-lg bg-card p-4 space-y-3">
          <div>
            <div className="font-medium">Password</div>
            <div className="text-xs text-muted-foreground">Leave current password blank if you signed up with OAuth.</div>
          </div>
          <div className="grid gap-3">
            <Input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <Input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div>
            <Button onClick={updatePassword} disabled={savingPassword}>
              {savingPassword ? "Saving..." : "Update Password"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
