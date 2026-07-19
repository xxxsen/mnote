"use client";

import type { SVGProps } from "react";
import { Suspense, useEffect } from "react";
import { Link2, Unlink } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { AppPage } from "@/components/app-page";
import { GithubIcon, GoogleIcon } from "@/components/brand-icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogStatus,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PageState } from "@/components/ui/page-state";
import { useToast } from "@/components/ui/toast";
import { getSafeInternalReturn } from "@/lib/navigation";

import {
  useAccountSettings,
  type PendingProviderAction,
  type Provider,
  type ProviderStatus,
} from "./hooks/useAccountSettings";

type ProviderConfig = {
  key: Provider;
  label: string;
  property: string;
  icon: (props: SVGProps<SVGSVGElement>) => React.JSX.Element;
};

const PROVIDERS: ProviderConfig[] = [
  {
    key: "github",
    label: "GitHub",
    property: "enable_github_oauth",
    icon: GithubIcon,
  },
  {
    key: "google",
    label: "Google",
    property: "enable_google_oauth",
    icon: GoogleIcon,
  },
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`settings-${title.toLowerCase().replaceAll(" ", "-")}`}>
      <div className="mb-3">
        <h2 id={`settings-${title.toLowerCase().replaceAll(" ", "-")}`} className="text-base font-semibold">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="overflow-hidden rounded-md border border-border bg-card">{children}</div>
    </section>
  );
}

function ProviderRow({
  config,
  status,
  pending,
  onBind,
  onUnbind,
}: {
  config: ProviderConfig;
  status: ProviderStatus;
  pending: PendingProviderAction;
  onBind: () => void;
  onUnbind: () => void;
}) {
  const Icon = config.icon;
  const ownPending = pending?.provider === config.key;
  return (
    <div className="flex min-h-20 items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border ${
          status.bound ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        }`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="font-medium">{config.label}</p>
          <p className="truncate text-xs text-muted-foreground">
            {status.bound
              ? `Linked${status.email ? ` as ${status.email}` : ""}`
              : "Not linked"}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={`h-2 w-2 rounded-full ${status.bound ? "bg-success" : "bg-warning"}`}
            aria-hidden="true"
          />
          <span className="hidden sm:inline">{status.bound ? "Connected" : "Available"}</span>
        </span>
        {status.bound ? (
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            aria-label={`Disconnect ${config.label}`}
            disabled={Boolean(pending)}
            isLoading={ownPending && pending.action === "unbind"}
            onClick={onUnbind}
          >
            <Unlink className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Disconnect</span>
          </Button>
        ) : (
          <Button
            type="button"
            className="gap-2"
            aria-label={`Connect ${config.label}`}
            disabled={Boolean(pending)}
            isLoading={ownPending && pending.action === "bind"}
            onClick={onBind}
          >
            <Link2 className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Connect</span>
          </Button>
        )}
      </div>
    </div>
  );
}

function UnbindDialog({
  provider,
  pending,
  onCancel,
  onConfirm,
}: {
  provider: Provider | null;
  pending: PendingProviderAction;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const label = provider === "github" ? "GitHub" : "Google";
  const busy = Boolean(pending && pending.provider === provider && pending.action === "unbind");
  return (
    <Dialog
      open={Boolean(provider)}
      role="alertdialog"
      title={`Disconnect ${label}?`}
      description="Make sure another sign-in method remains available before continuing."
      size="sm"
      dismissPolicy="when-idle"
      busy={busy}
      onClose={onCancel}
    >
      <DialogHeader />
      <DialogBody className="space-y-4">
        <p className="text-sm leading-6 text-muted-foreground">
          You will no longer be able to sign in with {label}. Keep another connected account or set
          a password first.
        </p>
        {busy ? <DialogStatus variant="loading">Disconnecting {label}…</DialogStatus> : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" className="h-11 w-full sm:w-auto" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="destructive"
          className="h-11 w-full sm:w-auto"
          isLoading={busy}
          onClick={onConfirm}
        >
          Disconnect
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const settings = useAccountSettings(toast);
  const retrySettings = settings.retry;
  const returnTo = getSafeInternalReturn(searchParams.get("return"));
  const enabledProviders = PROVIDERS.filter(
    (provider) => settings.properties?.[provider.property],
  );
  const passwordMismatch = Boolean(
    settings.confirmPassword && settings.newPassword !== settings.confirmPassword,
  );

  useEffect(() => {
    const status = searchParams.get("oauth");
    if (!status) return;
    const provider = searchParams.get("provider") || "Provider";
    if (status === "bound") {
      toast({ description: `${provider} bound successfully.`, variant: "success" });
      void retrySettings();
    } else if (status === "conflict") {
      toast({ description: "This provider is already linked to another account.", variant: "error" });
    } else {
      toast({ description: "Failed to bind provider.", variant: "error" });
    }
    const next = new URLSearchParams(searchParams.toString());
    next.delete("oauth");
    next.delete("provider");
    router.replace(next.size ? `/settings?${next.toString()}` : "/settings");
  }, [retrySettings, router, searchParams, toast]);

  return (
    <AppPage
      title="Account settings"
      description="Manage connected accounts and your password."
      onBack={() => router.push(returnTo)}
    >
      {settings.loadError ? (
        <PageState
          kind="error"
          title="Could not load account settings"
          description="No settings were changed. Try loading your account again."
          actionLabel="Retry"
          onAction={() => void settings.retry()}
        />
      ) : settings.loading ? (
        <PageState
          kind="loading"
          title="Loading account settings"
          description="Checking available sign-in methods."
        />
      ) : (
        <div className="space-y-8">
          <Section
            title="Connected accounts"
            description="Link providers for quick sign in and account recovery."
          >
            {enabledProviders.length === 0 ? (
              <PageState
                compact
                kind="empty"
                title="OAuth sign-in is disabled"
                description="Password sign-in remains available for this deployment."
              />
            ) : enabledProviders.map((provider) => (
              <ProviderRow
                key={provider.key}
                config={provider}
                status={settings.bindings[provider.key]}
                pending={settings.pendingProviderAction}
                onBind={() => void settings.startBind(provider.key, returnTo)}
                onUnbind={() => settings.requestUnbind(provider.key)}
              />
            ))}
          </Section>

          <Section
            title="Security"
            description="Set or update the password used to sign in to this account."
          >
            <form
              className="space-y-4 p-4 sm:p-5"
              onSubmit={(event) => {
                event.preventDefault();
                void settings.updatePassword();
              }}
            >
              <p className="text-sm text-muted-foreground">
                Leave the current password blank if this account does not have one yet.
              </p>
              <div>
                <label htmlFor="current-password" className="mb-1.5 block text-sm font-medium">
                  Current password
                </label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={settings.currentPassword}
                  onChange={(event) => settings.setCurrentPassword(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium">
                  New password
                </label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={settings.newPassword}
                  onChange={(event) => settings.setNewPassword(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium">
                  Confirm new password
                </label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  aria-invalid={passwordMismatch || undefined}
                  aria-describedby={passwordMismatch ? "confirm-password-error" : undefined}
                  value={settings.confirmPassword}
                  onChange={(event) => settings.setConfirmPassword(event.target.value)}
                />
                {passwordMismatch ? (
                  <p id="confirm-password-error" role="alert" className="mt-1.5 text-sm text-destructive">
                    Passwords do not match.
                  </p>
                ) : null}
              </div>
              <Button
                type="submit"
                className="w-full sm:w-auto"
                isLoading={settings.savingPassword}
                disabled={!settings.newPassword || passwordMismatch}
              >
                Update password
              </Button>
            </form>
          </Section>
        </div>
      )}

      <UnbindDialog
        provider={settings.unbindTarget}
        pending={settings.pendingProviderAction}
        onCancel={settings.cancelUnbind}
        onConfirm={() => void settings.confirmUnbind()}
      />
    </AppPage>
  );
}

export default function SettingsPage() {
  return (
    <Suspense
      fallback={(
        <PageState
          kind="loading"
          title="Loading account settings"
          description="Preparing the account page."
          className="min-h-dvh"
        />
      )}
    >
      <SettingsContent />
    </Suspense>
  );
}
