import { useState, useEffect, useCallback, useMemo } from "react";
import type { Document as MnoteDocument } from "@/types";
import { FLOATING_PANEL_COLLAPSED_KEY } from "../constants";

export function useFloatingPanel(opts: {
  docId: string;
  previewContent: string;
  summary: string;
  backlinks: MnoteDocument[];
  outboundLinks: MnoteDocument[];
}) {
  const { docId, previewContent, summary, backlinks, outboundLinks } = opts;

  const [tocContent, setTocContent] = useState("");
  const [tocCollapsed, setTocCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    const raw = window.localStorage.getItem(FLOATING_PANEL_COLLAPSED_KEY);
    return raw === "1" || raw === "true";
  });
  const [floatingPanelTab, setFloatingPanelTab] = useState<"toc" | "mentions" | "graph" | "summary">("toc");
  const [floatingPanelTouched, setFloatingPanelTouched] = useState(false);

  const handleTocLoaded = useCallback((toc: string) => { setTocContent(toc); }, []);

  const hasTocPanel = useMemo(() => {
    const hasToken = /\[(toc|TOC)]/.test(previewContent);
    return Boolean(tocContent && hasToken);
  }, [tocContent, previewContent]);

  const hasMentionsPanel = backlinks.length > 0;
  const hasGraphPanel = backlinks.length > 0 || outboundLinks.length > 0;
  const hasSummaryPanel = summary.trim().length > 0;

  const availableFloatingTabs = useMemo(() => {
    const tabs: Array<"toc" | "mentions" | "graph" | "summary"> = [];
    if (hasTocPanel) tabs.push("toc");
    if (hasMentionsPanel) tabs.push("mentions");
    if (hasGraphPanel) tabs.push("graph");
    if (hasSummaryPanel) tabs.push("summary");
    return tabs;
  }, [hasGraphPanel, hasMentionsPanel, hasSummaryPanel, hasTocPanel]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(FLOATING_PANEL_COLLAPSED_KEY, tocCollapsed ? "1" : "0");
  }, [tocCollapsed]);

  useEffect(() => {
    setFloatingPanelTab("toc");
    setFloatingPanelTouched(false);
  }, [docId]);

  useEffect(() => {
    if (availableFloatingTabs.length === 0) return;
    if (floatingPanelTouched) return;
    setFloatingPanelTab(availableFloatingTabs[0]);
  }, [availableFloatingTabs, floatingPanelTouched]);

  useEffect(() => {
    if (availableFloatingTabs.length === 0) return;
    if (!availableFloatingTabs.includes(floatingPanelTab)) {
      setFloatingPanelTab(availableFloatingTabs[0]);
    }
  }, [availableFloatingTabs, floatingPanelTab]);

  return {
    tocContent,
    tocCollapsed, setTocCollapsed,
    floatingPanelTab, setFloatingPanelTab,
    floatingPanelTouched, setFloatingPanelTouched,
    handleTocLoaded,
    hasTocPanel,
    hasMentionsPanel,
    hasGraphPanel,
    hasSummaryPanel,
    availableFloatingTabs,
  };
}
