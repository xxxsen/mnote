"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  FileCode,
  Share2,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";

type ActiveShare = {
  expires_at: number;
  permission: number;
  allow_download: number;
  password?: string;
};

type ShareConfig = {
  expires_at: number;
  permission: "view" | "comment";
  allow_download: boolean;
  password?: string;
  clear_password?: boolean;
};

export type DetailsShareContentProps = {
  active: boolean;
  activeShare: ActiveShare | null;
  shareUrl: string;
  copied: boolean;
  onShare: () => void;
  onRevokeShare: () => void;
  onCopyLink: () => void;
  onUpdateShareConfig: (config: ShareConfig) => Promise<void>;
  onExportMarkdown: () => void;
  onExportConfluenceHTML: () => void;
  onShowDeleteConfirm: () => void;
};

function resolveShareExpireTs(rawValue: string): number {
  const raw = rawValue.trim();
  if (!raw) return 0;
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateOnly) return 0;
  const year = Number(dateOnly[1]);
  const month = Number(dateOnly[2]);
  const day = Number(dateOnly[3]);
  const ts = Math.floor(
    new Date(year, month - 1, day, 23, 59, 59, 0).getTime() / 1000,
  );
  return Number.isFinite(ts) && ts > 0 ? ts : 0;
}

function useShareSettings(
  activeShare: ActiveShare | null,
  onUpdateShareConfig: (config: ShareConfig) => Promise<void>,
) {
  const [expiresAtInput, setExpiresAtInput] = useState("");
  const [expiresAtUnix, setExpiresAtUnix] = useState(0);
  const [passwordInput, setPasswordInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [permission, setPermission] = useState<"view" | "comment">("view");
  const [allowDownload, setAllowDownload] = useState(true);

  useEffect(() => {
    if (!activeShare) {
      setExpiresAtInput("");
      setExpiresAtUnix(0);
      setPasswordInput("");
      setPermission("view");
      setAllowDownload(true);
      return;
    }
    if (activeShare.expires_at > 0) {
      const local = new Date(
        activeShare.expires_at * 1000 - new Date().getTimezoneOffset() * 60000,
      )
        .toISOString()
        .slice(0, 10);
      setExpiresAtInput(local);
      setExpiresAtUnix(activeShare.expires_at);
    } else {
      setExpiresAtInput("");
      setExpiresAtUnix(0);
    }
    setPermission(activeShare.permission === 2 ? "comment" : "view");
    setAllowDownload(activeShare.allow_download === 1);
    setPasswordInput(activeShare.password || "");
  }, [activeShare]);

  const save = useCallback(
    async (overrides?: Partial<ShareConfig>) => {
      if (!activeShare) return;
      try {
        setSaving(true);
        const password = overrides?.password;
        const clearPassword = overrides?.clear_password === true;
        await onUpdateShareConfig({
          expires_at: overrides?.expires_at ?? expiresAtUnix,
          permission: overrides?.permission ?? permission,
          allow_download: overrides?.allow_download ?? allowDownload,
          password: password && password.trim() ? password.trim() : undefined,
          clear_password: clearPassword || undefined,
        });
        if (clearPassword) setPasswordInput("");
      } finally {
        setSaving(false);
      }
    },
    [
      activeShare,
      allowDownload,
      expiresAtUnix,
      onUpdateShareConfig,
      permission,
    ],
  );

  const changeExpiresAt = useCallback(
    (next: string) => {
      setExpiresAtInput(next);
      if (!next.trim()) {
        setExpiresAtUnix(0);
        void save({ expires_at: 0 });
        return;
      }
      const timestamp = resolveShareExpireTs(next);
      if (timestamp > 0) {
        setExpiresAtUnix(timestamp);
        void save({ expires_at: timestamp });
      }
    },
    [save],
  );

  return {
    expiresAtInput,
    passwordInput,
    saving,
    permission,
    allowDownload,
    changeExpiresAt,
    setPasswordInput,
    changePermission(next: "view" | "comment") {
      setPermission(next);
      void save({ permission: next });
    },
    changeAllowDownload(next: boolean) {
      setAllowDownload(next);
      void save({ allow_download: next });
    },
    savePassword(value: string) {
      if (value.trim()) void save({ password: value.trim() });
    },
    clearPassword() {
      setPasswordInput("");
      void save({ clear_password: true });
    },
  };
}

export function DetailsShareContent(props: DetailsShareContentProps) {
  const settings = useShareSettings(
    props.activeShare,
    props.onUpdateShareConfig,
  );
  return (
    <div hidden={!props.active} className="space-y-4">
      {props.activeShare ? (
        <Button
          variant="outline"
          className="w-full text-xs font-bold"
          onClick={props.onRevokeShare}
        >
          <X className="mr-2 h-3.5 w-3.5" />
          Revoke Share Link
        </Button>
      ) : (
        <Button onClick={props.onShare} className="w-full text-xs font-bold">
          <Share2 className="mr-2 h-3.5 w-3.5" />
          Generate Share Link
        </Button>
      )}
      {props.shareUrl ? (
        <ShareLink
          shareUrl={props.shareUrl}
          copied={props.copied}
          onCopy={props.onCopyLink}
        />
      ) : null}
      {props.activeShare ? <ShareSettings settings={settings} /> : null}
      <DocumentActions
        onExportMarkdown={props.onExportMarkdown}
        onExportConfluenceHTML={props.onExportConfluenceHTML}
        onShowDeleteConfirm={props.onShowDeleteConfirm}
      />
    </div>
  );
}

function ShareLink(props: {
  shareUrl: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onCopy}
      className="group relative w-full break-all rounded-lg border border-border bg-muted p-3 text-left font-mono text-[10px] transition-colors hover:bg-accent"
    >
      <span className="mb-1 flex items-center justify-between uppercase tracking-tighter text-muted-foreground">
        <span>Share Link</span>
        <Copy className="h-3 w-3 opacity-50 group-hover:opacity-100" />
      </span>
      <span className="block select-all leading-relaxed text-foreground">
        {props.shareUrl}
      </span>
      <span
        className={`absolute inset-0 flex items-center justify-center rounded-lg bg-accent/90 transition-opacity ${
          props.copied ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <span className="flex items-center gap-2">
          <Check className="h-3.5 w-3.5 text-primary" />
          <span className="text-[10px] font-bold">COPIED TO CLIPBOARD</span>
        </span>
      </span>
    </button>
  );
}

type Settings = ReturnType<typeof useShareSettings>;

function ShareSettings({ settings }: { settings: Settings }) {
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Share Settings
        </div>
        {settings.saving ? (
          <div className="text-[10px] text-muted-foreground">Saving…</div>
        ) : null}
      </div>
      <label className="block space-y-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Expiration date
        </span>
        <input
          type="date"
          value={settings.expiresAtInput}
          onChange={(event) => settings.changeExpiresAt(event.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Permission
        </span>
        <select
          value={settings.permission}
          onChange={(event) =>
            settings.changePermission(event.target.value as "view" | "comment")
          }
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="view">View only</option>
          <option value="comment">Allow comments</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={settings.allowDownload}
          onChange={(event) =>
            settings.changeAllowDownload(event.target.checked)
          }
        />
        Allow download
      </label>
      <div className="space-y-1">
        <label
          htmlFor="share-password"
          className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Password
        </label>
        <div className="flex gap-1">
          <input
            id="share-password"
            type="password"
            value={settings.passwordInput}
            onChange={(event) => settings.setPasswordInput(event.target.value)}
            onBlur={(event) => settings.savePassword(event.target.value)}
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs"
            placeholder="Optional"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 px-2 text-[10px]"
            onClick={() => settings.clearPassword()}
          >
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
}

function DocumentActions(props: {
  onExportMarkdown: () => void;
  onExportConfluenceHTML: () => void;
  onShowDeleteConfirm: () => void;
}) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!showExportMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && !menuRef.current?.contains(target)) {
        setShowExportMenu(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [showExportMenu]);

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="relative mb-2" ref={menuRef}>
        <div className="flex items-center">
          <Button
            variant="outline"
            className="w-full rounded-r-none text-xs font-bold"
            onClick={() => {
              setShowExportMenu(false);
              props.onExportMarkdown();
            }}
          >
            <Download className="mr-2 h-3.5 w-3.5" />
            Download
          </Button>
          <Button
            variant="outline"
            className="rounded-l-none border-l-0 px-2"
            onClick={() => setShowExportMenu(!showExportMenu)}
            aria-label="More download options"
            aria-expanded={showExportMenu}
            aria-haspopup="menu"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${
                showExportMenu ? "rotate-180" : ""
              }`}
            />
          </Button>
        </div>
        {showExportMenu ? (
          <div
            role="menu"
            className="absolute right-0 top-full z-[220] mt-2 w-56 rounded-xl border border-border bg-popover p-1 shadow-md"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                setShowExportMenu(false);
                props.onExportConfluenceHTML();
              }}
            >
              <FileCode className="h-3.5 w-3.5" />
              Confluence HTML
            </button>
          </div>
        ) : null}
      </div>
      <Button
        variant="destructive"
        className="w-full text-xs font-bold"
        onClick={props.onShowDeleteConfirm}
      >
        <Trash2 className="mr-2 h-3.5 w-3.5" />
        Delete Note
      </Button>
    </div>
  );
}
