import React, { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Share2, Download, Trash2, ChevronDown, X, FileCode, Copy, Check } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { DocumentVersionSummary } from "@/types";

type DetailsSidebarProps = {
  showDetails: boolean;
  onClose: () => void;
  activeTab: "summary" | "history" | "share";
  setActiveTab: (tab: "summary" | "history" | "share") => void;
  summary: string;
  aiLoading: boolean;
  onGenerateSummary: () => void;
  onShowDeleteConfirm: () => void;
  onExportMarkdown: () => void;
  onExportConfluenceHTML: () => void;
  documentActions: { listVersions: () => Promise<DocumentVersionSummary[]> };
  onRevert: (v: DocumentVersionSummary) => void;
  shareUrl: string;
  activeShare: {
    expires_at: number;
    permission: number;
    allow_download: number;
    password?: string;
  } | null;
  copied: boolean;
  onShare: () => void;
  onLoadShare: () => void;
  onRevokeShare: () => void;
  onCopyLink: () => void;
  onUpdateShareConfig: (config: {
    expires_at: number;
    permission: "view" | "comment";
    allow_download: boolean;
    password?: string;
    clear_password?: boolean;
  }) => Promise<void>;
};

function resolveShareExpireTs(rawValue: string): number {
  const raw = rawValue.trim();
  if (!raw) return 0;
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateOnly) return 0;
  const year = Number(dateOnly[1]);
  const month = Number(dateOnly[2]);
  const day = Number(dateOnly[3]);
  const ts = Math.floor(new Date(year, month - 1, day, 23, 59, 59, 0).getTime() / 1000);
  return Number.isFinite(ts) && ts > 0 ? ts : 0;
}

export function DetailsSidebar(props: DetailsSidebarProps) {
  const {
    showDetails, onClose, activeTab, setActiveTab, summary,
    aiLoading, onGenerateSummary, onShowDeleteConfirm, onExportMarkdown, onExportConfluenceHTML,
    documentActions, onRevert,
    shareUrl, activeShare, copied, onShare, onLoadShare, onRevokeShare, onCopyLink, onUpdateShareConfig,
  } = props;

  const [versions, setVersions] = useState<DocumentVersionSummary[]>([]);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  const [shareExpiresAtInput, setShareExpiresAtInput] = useState("");
  const [shareExpiresAtUnix, setShareExpiresAtUnix] = useState(0);
  const [sharePasswordInput, setSharePasswordInput] = useState("");
  const [shareConfigSaving, setShareConfigSaving] = useState(false);
  const [sharePermission, setSharePermission] = useState<"view" | "comment">("view");
  const [shareAllowDownload, setShareAllowDownload] = useState(true);

  useEffect(() => {
    if (!activeShare) {
      setShareExpiresAtInput(""); setShareExpiresAtUnix(0); setSharePasswordInput(""); setSharePermission("view"); setShareAllowDownload(true);
      return;
    }
    if (activeShare.expires_at > 0) {
      const local = new Date(activeShare.expires_at * 1000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      setShareExpiresAtInput(local); setShareExpiresAtUnix(activeShare.expires_at);
    } else { setShareExpiresAtInput(""); setShareExpiresAtUnix(0); }
    setSharePermission(activeShare.permission === 2 ? "comment" : "view");
    setShareAllowDownload(activeShare.allow_download === 1);
    setSharePasswordInput(activeShare.password || "");
  }, [activeShare]);

  const saveShareConfig = useCallback(async (overrides?: Partial<{
    expires_at: number; permission: "view" | "comment"; allow_download: boolean; password: string; clear_password: boolean;
  }>) => {
    if (!activeShare) return;
    try {
      setShareConfigSaving(true);
      const password = overrides?.password;
      const clearPassword = overrides?.clear_password === true;
      await onUpdateShareConfig({
        expires_at: overrides?.expires_at ?? shareExpiresAtUnix,
        permission: overrides?.permission ?? sharePermission,
        allow_download: overrides?.allow_download ?? shareAllowDownload,
        password: password && password.trim() ? password.trim() : undefined,
        clear_password: clearPassword || undefined,
      });
      if (clearPassword) setSharePasswordInput("");
    } finally { setShareConfigSaving(false); }
  }, [activeShare, shareAllowDownload, shareExpiresAtUnix, sharePermission, onUpdateShareConfig]);

  const handleShareExpireAtChange = useCallback((next: string) => {
    setShareExpiresAtInput(next);
    if (!next.trim()) { setShareExpiresAtUnix(0); void saveShareConfig({ expires_at: 0 }); return; }
    const ts = resolveShareExpireTs(next);
    if (ts > 0) { setShareExpiresAtUnix(ts); void saveShareConfig({ expires_at: ts }); }
  }, [saveShareConfig]);

  const loadVersions = useCallback(async () => {
    try { const v = await documentActions.listVersions(); setVersions(v); } catch (e) { console.error(e); }
  }, [documentActions]);

  useEffect(() => {
    if (!showExportMenu) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (exportMenuRef.current?.contains(target)) return;
      setShowExportMenu(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [showExportMenu]);

  useEffect(() => {
    if (activeTab !== "share" || !showDetails) setShowExportMenu(false);
  }, [activeTab, showDetails]);

  if (!showDetails) return null;

  return (
    <div className="w-80 border-l border-border bg-background flex flex-col absolute right-0 top-0 bottom-0 z-[100] shadow-xl">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1">Details</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>
      <div className="flex items-center border-b border-border bg-muted/20">
        <button className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === "summary" ? "border-b-2 border-foreground" : "text-muted-foreground"}`} onClick={() => setActiveTab("summary")}>Summary</button>
        <button className={`flex-1 py-3 text-[10px] sm:text-xs font-bold uppercase tracking-wider ${activeTab === "history" ? "border-b-2 border-foreground" : "text-muted-foreground"}`} onClick={() => { setActiveTab("history"); void loadVersions(); }}>History</button>
        <button className={`flex-1 py-3 text-[10px] sm:text-xs font-bold uppercase tracking-wider ${activeTab === "share" ? "border-b-2 border-foreground" : "text-muted-foreground"}`} onClick={() => { setActiveTab("share"); onLoadShare(); }}>Share</button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "summary" && (
          <div className="space-y-4">
            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">AI Summary</div>
            {summary ? (<div className="text-sm leading-relaxed whitespace-pre-wrap border border-border rounded-xl p-3 bg-muted/20">{summary}</div>) : (<div className="text-sm text-muted-foreground">No summary yet</div>)}
            <Button variant="outline" size="sm" className="w-full text-xs rounded-xl" onClick={onGenerateSummary} disabled={aiLoading}>Generate Summary</Button>
          </div>
        )}
        {activeTab === "history" && (
          <div className="space-y-4">
            {versions.length === 0 ? (<div className="text-sm text-muted-foreground">No history available</div>) : versions.map((v, index) => (
              <div key={v.version} className="border border-border p-3 text-sm">
                <div className="font-mono text-xs text-muted-foreground mb-1">v{v.version} • {formatDate(v.ctime)}</div>
                <div className="font-bold mb-2 truncate">{v.title}</div>
                {index === 0 ? (<Button variant="outline" size="sm" className="w-full h-7 text-xs font-semibold tracking-wide" disabled>CURRENT</Button>) : (<Button variant="outline" size="sm" className="w-full h-7" onClick={() => onRevert(v)}>Revert</Button>)}
              </div>
            ))}
          </div>
        )}
        {activeTab === "share" && (
          <ShareTabContent
            activeShare={activeShare} shareUrl={shareUrl} copied={copied}
            onShare={onShare} onRevokeShare={onRevokeShare} onCopyLink={onCopyLink}
            shareExpiresAtInput={shareExpiresAtInput} onShareExpireAtChange={handleShareExpireAtChange}
            sharePermission={sharePermission} onPermissionChange={(next) => { setSharePermission(next); void saveShareConfig({ permission: next }); }}
            shareAllowDownload={shareAllowDownload} onAllowDownloadChange={(next) => { setShareAllowDownload(next); void saveShareConfig({ allow_download: next }); }}
            sharePasswordInput={sharePasswordInput} onPasswordChange={setSharePasswordInput}
            onPasswordSave={(val) => { if (val.trim()) void saveShareConfig({ password: val.trim() }); }}
            onPasswordClear={() => { setSharePasswordInput(""); void saveShareConfig({ clear_password: true }); }}
            shareConfigSaving={shareConfigSaving}
            showExportMenu={showExportMenu} setShowExportMenu={setShowExportMenu} exportMenuRef={exportMenuRef}
            onExportMarkdown={onExportMarkdown} onExportConfluenceHTML={onExportConfluenceHTML}
            onShowDeleteConfirm={onShowDeleteConfirm}
          />
        )}
      </div>
    </div>
  );
}

function ShareTabContent(props: {
  activeShare: DetailsSidebarProps["activeShare"];
  shareUrl: string; copied: boolean;
  onShare: () => void; onRevokeShare: () => void; onCopyLink: () => void;
  shareExpiresAtInput: string; onShareExpireAtChange: (v: string) => void;
  sharePermission: "view" | "comment"; onPermissionChange: (v: "view" | "comment") => void;
  shareAllowDownload: boolean; onAllowDownloadChange: (v: boolean) => void;
  sharePasswordInput: string; onPasswordChange: (v: string) => void;
  onPasswordSave: (v: string) => void; onPasswordClear: () => void;
  shareConfigSaving: boolean;
  showExportMenu: boolean; setShowExportMenu: (v: boolean) => void; exportMenuRef: React.RefObject<HTMLDivElement | null>;
  onExportMarkdown: () => void; onExportConfluenceHTML: () => void;
  onShowDeleteConfirm: () => void;
}) {
  const {
    activeShare, shareUrl, copied, onShare, onRevokeShare, onCopyLink,
    shareExpiresAtInput, onShareExpireAtChange,
    sharePermission, onPermissionChange,
    shareAllowDownload, onAllowDownloadChange,
    sharePasswordInput, onPasswordChange, onPasswordSave, onPasswordClear,
    shareConfigSaving,
    showExportMenu, setShowExportMenu, exportMenuRef,
    onExportMarkdown, onExportConfluenceHTML, onShowDeleteConfirm,
  } = props;

  return (
    <div className="space-y-4">
      {activeShare ? (
        <Button variant="outline" className="w-full text-xs font-bold" onClick={onRevokeShare}><X className="mr-2 h-3.5 w-3.5" />Revoke Share Link</Button>
      ) : (
        <Button onClick={onShare} className="w-full text-xs font-bold"><Share2 className="mr-2 h-3.5 w-3.5" />Generate Share Link</Button>
      )}
      {shareUrl && (
        <div onClick={onCopyLink} className="group p-3 bg-muted border border-border rounded-lg break-all text-[10px] font-mono cursor-pointer hover:bg-accent transition-colors relative">
          <div className="mb-1 text-muted-foreground uppercase tracking-tighter flex items-center justify-between"><span>Share Link</span><Copy className="h-3 w-3 opacity-50 group-hover:opacity-100" /></div>
          <div className="text-foreground leading-relaxed select-all">{shareUrl}</div>
          <div className={`absolute inset-0 flex items-center justify-center bg-accent/90 transition-opacity rounded-lg ${copied ? "opacity-100" : "opacity-0 pointer-events-none"}`}><div className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-primary" /><span className="text-[10px] font-bold">COPIED TO CLIPBOARD</span></div></div>
        </div>
      )}
      {activeShare && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Share Settings</div>
            {shareConfigSaving && <div className="text-[10px] text-muted-foreground">Saving...</div>}
          </div>
          <div className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-x-2 gap-y-2">
            <div className="text-[11px] text-muted-foreground">Expire At</div>
            <div className="min-w-0 flex items-center gap-1.5"><input type="date" value={shareExpiresAtInput} onChange={(e) => onShareExpireAtChange(e.target.value)} onBlur={(e) => onShareExpireAtChange(e.target.value)} className="h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-xs" /></div>
            <div className="text-[11px] text-muted-foreground">Permission</div>
            <select value={sharePermission} onChange={(e) => onPermissionChange(e.target.value as "view" | "comment")} className="h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-xs"><option value="view">View</option><option value="comment">Comment</option></select>
            <div className="text-[11px] text-muted-foreground">Allow Download</div>
            <label className="inline-flex items-center h-8"><input type="checkbox" checked={shareAllowDownload} onChange={(e) => onAllowDownloadChange(e.target.checked)} /></label>
            <div className="text-[11px] text-muted-foreground">Password</div>
            <div className="min-w-0 relative">
              <input type="text" value={sharePasswordInput} maxLength={6} inputMode="text" autoComplete="off" onChange={(e) => onPasswordChange(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 6))} onBlur={() => onPasswordSave(sharePasswordInput)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onPasswordSave(sharePasswordInput); } }} placeholder="Set password" className="h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 pr-9 text-xs" />
              <button type="button" className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground" onClick={onPasswordClear} title="Clear password"><X className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </div>
      )}
      <div className="pt-4 border-t border-border mt-4">
        <div className="relative mb-2" ref={exportMenuRef}>
          <div className="flex items-center">
            <Button variant="outline" className="w-full rounded-r-none text-xs font-bold" onClick={() => { setShowExportMenu(false); onExportMarkdown(); }}><Download className="mr-2 h-3.5 w-3.5" />Download</Button>
            <Button variant="outline" className="rounded-l-none border-l-0 px-2" onClick={() => setShowExportMenu(!showExportMenu)} aria-label="More download options" aria-expanded={showExportMenu} aria-haspopup="menu"><ChevronDown className={`h-3.5 w-3.5 transition-transform ${showExportMenu ? "rotate-180" : ""}`} /></Button>
          </div>
          {showExportMenu && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-border bg-popover p-1 shadow-md z-[120] animate-in fade-in zoom-in-95 duration-150">
              <button type="button" className="flex w-full items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold hover:bg-accent hover:text-accent-foreground" onClick={() => { setShowExportMenu(false); onExportConfluenceHTML(); }}><FileCode className="h-3.5 w-3.5" />Confluence HTML</button>
            </div>
          )}
        </div>
        <Button variant="destructive" className="w-full text-xs font-bold" onClick={onShowDeleteConfirm}><Trash2 className="mr-2 h-3.5 w-3.5" />Delete Note</Button>
      </div>
    </div>
  );
}
