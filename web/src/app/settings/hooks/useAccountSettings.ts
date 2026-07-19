"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ToastInput } from "@/components/ui/toast";
import { ApiError, apiFetch } from "@/lib/api";

export type Provider = "github" | "google";

export type ProviderStatus = {
  bound: boolean;
  email?: string;
};

export type PendingProviderAction = {
  provider: Provider;
  action: "bind" | "unbind";
} | null;

type BindingItem = {
  provider: Provider;
  email?: string;
};

type Toast = (input: ToastInput) => void;

const CONFLICT_CODE = 10000005;

function defaultBindings(): Record<Provider, ProviderStatus> {
  return {
    github: { bound: false },
    google: { bound: false },
  };
}

function useSettingsData() {
  const [bindings, setBindings] = useState<Record<Provider, ProviderStatus>>(defaultBindings);
  const [properties, setProperties] = useState<Record<string, boolean> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const requestIDRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    const requestID = ++requestIDRef.current;
    abortRef.current = controller;
    setLoading(true);
    setLoadError(false);
    try {
      const [bindingResponse, propertyResponse] = await Promise.all([
        apiFetch<{ bindings: BindingItem[] }>("/auth/oauth/bindings", {
          signal: controller.signal,
        }),
        apiFetch<{ properties: Record<string, boolean> }>("/properties", {
          requireAuth: false,
          signal: controller.signal,
        }),
      ]);
      if (requestIDRef.current !== requestID) return;
      const next = defaultBindings();
      bindingResponse.bindings.forEach((item) => {
        next[item.provider] = { bound: true, email: item.email };
      });
      setBindings(next);
      setProperties(propertyResponse.properties);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (requestIDRef.current === requestID) setLoadError(true);
    } finally {
      if (requestIDRef.current === requestID) {
        abortRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  return {
    bindings,
    setBindings,
    properties,
    loading,
    loadError,
    retry: load,
  };
}

function useProviderActions(
  setBindings: React.Dispatch<React.SetStateAction<Record<Provider, ProviderStatus>>>,
  toast: Toast,
) {
  const [pendingProviderAction, setPendingProviderAction] = useState<PendingProviderAction>(null);
  const [unbindTarget, setUnbindTarget] = useState<Provider | null>(null);
  const pendingRef = useRef<PendingProviderAction>(null);

  const startBind = useCallback(async (provider: Provider, returnTo: string) => {
    if (pendingRef.current) return;
    const pending: PendingProviderAction = { provider, action: "bind" };
    pendingRef.current = pending;
    setPendingProviderAction(pending);
    try {
      const response = await apiFetch<{ url: string }>(
        `/auth/oauth/${provider}/bind/url?return=${encodeURIComponent(returnTo)}`,
      );
      window.location.assign(response.url);
    } catch (error) {
      console.error(error);
      toast({ description: "Could not start account binding. Try again.", variant: "error" });
    } finally {
      pendingRef.current = null;
      setPendingProviderAction(null);
    }
  }, [toast]);

  const requestUnbind = useCallback((provider: Provider) => {
    if (!pendingRef.current) setUnbindTarget(provider);
  }, []);
  const cancelUnbind = useCallback(() => {
    if (!pendingRef.current) setUnbindTarget(null);
  }, []);
  const confirmUnbind = useCallback(async () => {
    if (!unbindTarget || pendingRef.current) return;
    const pending: PendingProviderAction = { provider: unbindTarget, action: "unbind" };
    pendingRef.current = pending;
    setPendingProviderAction(pending);
    try {
      await apiFetch(`/auth/oauth/${unbindTarget}/bind`, { method: "DELETE" });
      setBindings((previous) => ({
        ...previous,
        [unbindTarget]: { bound: false },
      }));
      setUnbindTarget(null);
      toast({ description: `${unbindTarget === "github" ? "GitHub" : "Google"} was disconnected.`, variant: "success" });
    } catch (error) {
      console.error(error);
      const description = error instanceof ApiError && error.code === CONFLICT_CODE
        ? "Set a password or keep another sign-in method before disconnecting this account."
        : "Could not disconnect this account. Try again.";
      toast({ description, variant: "error" });
    } finally {
      pendingRef.current = null;
      setPendingProviderAction(null);
    }
  }, [setBindings, toast, unbindTarget]);

  return {
    pendingProviderAction,
    unbindTarget,
    startBind,
    requestUnbind,
    cancelUnbind,
    confirmUnbind,
  };
}

function usePasswordUpdate(toast: Toast) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const savingRef = useRef(false);

  const updatePassword = useCallback(async () => {
    if (savingRef.current) return;
    if (!newPassword.trim()) {
      toast({ description: "Enter a new password.", variant: "error" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ description: "New password and confirmation do not match.", variant: "error" });
      return;
    }
    savingRef.current = true;
    setSavingPassword(true);
    try {
      await apiFetch("/auth/password", {
        method: "PUT",
        body: JSON.stringify({
          current_password: currentPassword || undefined,
          password: newPassword,
        }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ description: "Password updated.", variant: "success" });
    } catch (error) {
      console.error(error);
      toast({ description: "Could not update the password. Check your current password and try again.", variant: "error" });
    } finally {
      savingRef.current = false;
      setSavingPassword(false);
    }
  }, [confirmPassword, currentPassword, newPassword, toast]);

  return {
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    savingPassword,
    updatePassword,
  };
}

export function useAccountSettings(toast: Toast) {
  const data = useSettingsData();
  const providers = useProviderActions(data.setBindings, toast);
  const password = usePasswordUpdate(toast);
  return { ...data, ...providers, ...password };
}
