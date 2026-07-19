"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { FileText, History, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import type { DocumentVersionSummary } from "@/types";
import type { EditorDetailsTab } from "../hooks/useEditorContextRail";
import { DetailsShareContent } from "./DetailsShareContent";

export type DetailsPanelContentProps = {
  active: boolean;
  activeTab: EditorDetailsTab;
  onTabChange: (tab: EditorDetailsTab) => void;
  summary: string;
  aiLoading: boolean;
  onGenerateSummary: () => void;
  onShowDeleteConfirm: () => void;
  onExportMarkdown: () => void;
  onExportConfluenceHTML: () => void;
  documentActions: {
    listVersions: () => Promise<DocumentVersionSummary[]>;
  };
  onRevert: (version: DocumentVersionSummary) => void;
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
  onError: (message: string) => void;
};

export function DetailsPanelContent(props: DetailsPanelContentProps) {
  const { active, activeTab, documentActions, onError, onLoadShare } = props;
  const tabsId = useId();
  const [versions, setVersions] = useState<DocumentVersionSummary[]>([]);
  const loadedTabRef = useRef<EditorDetailsTab | null>(null);
  const loadVersions = useCallback(async () => {
    try {
      setVersions(await documentActions.listVersions());
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Failed to load history",
      );
    }
  }, [documentActions, onError]);

  useEffect(() => {
    if (!active || loadedTabRef.current === activeTab) return;
    const tabToLoad = activeTab;
    const timer = window.setTimeout(() => {
      loadedTabRef.current = tabToLoad;
      if (tabToLoad === "history") void loadVersions();
      if (tabToLoad === "share") onLoadShare();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active, activeTab, loadVersions, onLoadShare]);

  const tabs = [
    {
      id: "summary" as const,
      label: "Summary",
      icon: <FileText aria-hidden="true" className="h-3 w-3" />,
    },
    {
      id: "history" as const,
      label: "History",
      icon: <History aria-hidden="true" className="h-3 w-3" />,
    },
    {
      id: "share" as const,
      label: "Share",
      icon: <Share2 aria-hidden="true" className="h-3 w-3" />,
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="tablist"
        aria-label="Document details"
        className="grid grid-cols-3 border-b border-border bg-muted/20"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`${tabsId}-${tab.id}-tab`}
            type="button"
            role="tab"
            aria-selected={props.activeTab === tab.id}
            aria-controls={`${tabsId}-${tab.id}-panel`}
            tabIndex={props.activeTab === tab.id ? 0 : -1}
            onClick={() => props.onTabChange(tab.id)}
            className={`min-h-10 border-b-2 px-1 text-xs font-semibold transition-colors ${
              props.activeTab === tab.id
                ? "border-primary bg-accent text-foreground"
                : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }`}
          >
            <span className="flex items-center justify-center gap-1">
              {tab.icon}
              {tab.label}
            </span>
          </button>
        ))}
      </div>
      <div
        id={`${tabsId}-${props.activeTab}-panel`}
        role="tabpanel"
        aria-labelledby={`${tabsId}-${props.activeTab}-tab`}
        className="min-h-0 flex-1 overflow-y-auto p-3"
      >
        {props.activeTab === "summary" ? (
          <SummaryContent
            summary={props.summary}
            aiLoading={props.aiLoading}
            onGenerateSummary={props.onGenerateSummary}
          />
        ) : null}
        {props.activeTab === "history" ? (
          <HistoryContent versions={versions} onRevert={props.onRevert} />
        ) : null}
        <DetailsShareContent
          active={props.activeTab === "share"}
          activeShare={props.activeShare}
          shareUrl={props.shareUrl}
          copied={props.copied}
          onShare={props.onShare}
          onRevokeShare={props.onRevokeShare}
          onCopyLink={props.onCopyLink}
          onUpdateShareConfig={props.onUpdateShareConfig}
          onExportMarkdown={props.onExportMarkdown}
          onExportConfluenceHTML={props.onExportConfluenceHTML}
          onShowDeleteConfirm={props.onShowDeleteConfirm}
        />
      </div>
    </div>
  );
}

function SummaryContent(props: {
  summary: string;
  aiLoading: boolean;
  onGenerateSummary: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="text-xs font-semibold text-muted-foreground">
        AI summary
      </div>
      {props.summary ? (
        <div className="whitespace-pre-wrap rounded-xl border border-border bg-muted/20 p-3 text-sm leading-relaxed">
          {props.summary}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">No summary yet</div>
      )}
      <Button
        variant="outline"
        size="sm"
        className="w-full rounded-xl text-xs"
        onClick={props.onGenerateSummary}
        disabled={props.aiLoading}
      >
        Generate summary
      </Button>
    </div>
  );
}

function HistoryContent(props: {
  versions: DocumentVersionSummary[];
  onRevert: (version: DocumentVersionSummary) => void;
}) {
  if (props.versions.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">No history available</div>
    );
  }
  return (
    <div className="space-y-4">
      {props.versions.map((version, index) => (
        <div key={version.version} className="border border-border p-3 text-sm">
          <div className="mb-1 font-mono text-xs text-muted-foreground">
            v{version.version} • {formatDate(version.ctime)}
          </div>
          <div className="mb-2 truncate font-bold">{version.title}</div>
          {index === 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-full text-xs font-semibold tracking-wide"
              disabled
            >
              CURRENT
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-full"
              onClick={() => props.onRevert(version)}
            >
              Revert
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
