import React, { useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Menu, X, Network } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { Document as MnoteDocument } from "@/types";
import { slugify } from "../utils";

type FloatingPanelProps = {
  showDetails: boolean;
  hasTocPanel: boolean;
  hasMentionsPanel: boolean;
  hasGraphPanel: boolean;
  hasSummaryPanel: boolean;
  tocCollapsed: boolean;
  setTocCollapsed: (v: boolean) => void;
  floatingPanelTab: "toc" | "mentions" | "graph" | "summary";
  setFloatingPanelTab: (tab: "toc" | "mentions" | "graph" | "summary") => void;
  setFloatingPanelTouched: (v: boolean) => void;
  tocContent: string;
  summary: string;
  backlinks: MnoteDocument[];
  outboundLinks: MnoteDocument[];
  linkGraph: {
    nodes: Array<{ id: string; title: string; x: number; y: number; kind: "current" | "incoming" | "outgoing" | "both" }>;
    edges: Array<{ from: string; to: string }>;
    positionByID: Record<string, { x: number; y: number }>;
  };
  previewRef: React.RefObject<HTMLDivElement | null>;
  forcePreviewSyncRef: React.RefObject<boolean>;
  handlePreviewScroll: () => void;
  onNavigate: (path: string) => void;
};

export function FloatingPanel(props: FloatingPanelProps) {
  const {
    showDetails, hasTocPanel, hasMentionsPanel, hasGraphPanel, hasSummaryPanel,
    tocCollapsed, setTocCollapsed, floatingPanelTab, setFloatingPanelTab, setFloatingPanelTouched,
    tocContent, summary, backlinks, outboundLinks, linkGraph,
    previewRef, forcePreviewSyncRef, handlePreviewScroll, onNavigate,
  } = props;

  const getElementById = useCallback((id: string) => {
    const container = previewRef.current;
    if (!container) return null;
    const safe = CSS.escape(id);
    return container.querySelector<HTMLElement>(`#${safe}`);
  }, [previewRef]);

  const scrollToElement = useCallback((el: HTMLElement) => {
    const container = previewRef.current;
    if (!container) return;
    const isScrollable = container.scrollHeight > container.clientHeight + 1;
    if (!isScrollable) return;
    const containerTop = container.getBoundingClientRect().top;
    const targetTop = el.getBoundingClientRect().top;
    const offset = targetTop - containerTop + container.scrollTop;
    container.scrollTo({ top: offset, behavior: "smooth" });
  }, [previewRef]);

  const hasAnyPanel = hasTocPanel || hasMentionsPanel || hasGraphPanel || hasSummaryPanel;
  if (showDetails || !hasAnyPanel) return null;

  const selectTab = (tab: "toc" | "mentions" | "graph" | "summary") => {
    setFloatingPanelTab(tab);
    setFloatingPanelTouched(true);
  };

  return (
    <div className="fixed top-24 right-8 z-30 hidden w-72 rounded-2xl border border-slate-200/60 bg-white/80 shadow-2xl backdrop-blur-md xl:block animate-in fade-in slide-in-from-right-4 duration-500">
      <FloatingPanelHeader hasTocPanel={hasTocPanel} hasMentionsPanel={hasMentionsPanel} hasGraphPanel={hasGraphPanel} hasSummaryPanel={hasSummaryPanel} floatingPanelTab={floatingPanelTab} selectTab={selectTab} tocCollapsed={tocCollapsed} setTocCollapsed={setTocCollapsed} />
      {!tocCollapsed && (
        <FloatingPanelContent floatingPanelTab={floatingPanelTab} hasTocPanel={hasTocPanel} tocContent={tocContent} getElementById={getElementById} scrollToElement={scrollToElement} forcePreviewSyncRef={forcePreviewSyncRef} handlePreviewScroll={handlePreviewScroll} backlinks={backlinks} outboundLinks={outboundLinks} linkGraph={linkGraph} summary={summary} onNavigate={onNavigate} />
      )}
    </div>
  );
}

function FloatingPanelHeader(props: {
  hasTocPanel: boolean; hasMentionsPanel: boolean; hasGraphPanel: boolean; hasSummaryPanel: boolean;
  floatingPanelTab: string; selectTab: (tab: "toc" | "mentions" | "graph" | "summary") => void;
  tocCollapsed: boolean; setTocCollapsed: (v: boolean) => void;
}) {
  const { hasTocPanel, hasMentionsPanel, hasGraphPanel, hasSummaryPanel, floatingPanelTab, selectTab, tocCollapsed, setTocCollapsed } = props;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/60">
      <div className="flex-1 min-w-0 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1 pr-2">
          {hasTocPanel && <TabButton label="TOC" active={floatingPanelTab === "toc"} onClick={() => selectTab("toc")} />}
          {hasMentionsPanel && <TabButton label="Mentions" active={floatingPanelTab === "mentions"} onClick={() => selectTab("mentions")} />}
          {hasGraphPanel && <TabButton label="Graph" active={floatingPanelTab === "graph"} onClick={() => selectTab("graph")} />}
          {hasSummaryPanel && <TabButton label="Summary" active={floatingPanelTab === "summary"} onClick={() => selectTab("summary")} />}
        </div>
      </div>
      <button onClick={() => setTocCollapsed(!tocCollapsed)} className="shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-all">
        {tocCollapsed ? <Menu className="h-3 w-3" /> : <X className="h-3 w-3" />}
      </button>
    </div>
  );
}

function FloatingPanelContent(props: {
  floatingPanelTab: string; hasTocPanel: boolean;
  tocContent: string; getElementById: (id: string) => HTMLElement | null; scrollToElement: (el: HTMLElement) => void;
  forcePreviewSyncRef: React.RefObject<boolean>; handlePreviewScroll: () => void;
  backlinks: MnoteDocument[]; outboundLinks: MnoteDocument[];
  linkGraph: FloatingPanelProps["linkGraph"]; summary: string; onNavigate: (path: string) => void;
}) {
  const { floatingPanelTab, hasTocPanel, tocContent, getElementById, scrollToElement, forcePreviewSyncRef, handlePreviewScroll, backlinks, outboundLinks, linkGraph, summary, onNavigate } = props;
  return (
    <div className="text-sm max-h-[60vh] overflow-y-auto p-4 custom-scrollbar">
      {floatingPanelTab === "toc" ? (
        hasTocPanel ? <TocView tocContent={tocContent} getElementById={getElementById} scrollToElement={scrollToElement} forcePreviewSyncRef={forcePreviewSyncRef} handlePreviewScroll={handlePreviewScroll} /> : <div className="text-xs text-slate-400 italic">No TOC available for this note.</div>
      ) : floatingPanelTab === "mentions" ? (
        <MentionsView backlinks={backlinks} onNavigate={onNavigate} />
      ) : floatingPanelTab === "graph" ? (
        <GraphView linkGraph={linkGraph} backlinks={backlinks} outboundLinks={outboundLinks} onNavigate={onNavigate} />
      ) : (
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-widest text-slate-500">AI Summary</div>
          <div className="text-xs leading-relaxed whitespace-pre-wrap text-slate-700">{summary}</div>
        </div>
      )}
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`shrink-0 px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wide transition-colors ${active ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"}`}>
      {label}
    </button>
  );
}

function TocView(props: {
  tocContent: string;
  getElementById: (id: string) => HTMLElement | null;
  scrollToElement: (el: HTMLElement) => void;
  forcePreviewSyncRef: React.RefObject<boolean>;
  handlePreviewScroll: () => void;
}) {
  const { tocContent, getElementById, scrollToElement, forcePreviewSyncRef, handlePreviewScroll } = props;
  return (
    <div className="toc-wrapper">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={{
        a: (aProps) => {
          const href = aProps.href || "";
          return (
            <a {...aProps} className="text-slate-500 hover:text-indigo-600 transition-colors py-1 block no-underline" onClick={(event) => {
              aProps.onClick?.(event);
              if (!href.startsWith("#")) return;
              event.preventDefault();
              const rawHash = decodeURIComponent(href.slice(1));
              const normalizedHash = rawHash.normalize("NFKC");
              const targetCandidates = [rawHash, normalizedHash, slugify(rawHash), slugify(normalizedHash)];
              for (const candidate of targetCandidates) {
                const el = getElementById(candidate);
                if (el) { scrollToElement(el); requestAnimationFrame(() => { forcePreviewSyncRef.current = true; handlePreviewScroll(); }); break; }
              }
            }} />
          );
        },
      }}>
        {tocContent}
      </ReactMarkdown>
    </div>
  );
}

function MentionsView({ backlinks, onNavigate }: { backlinks: MnoteDocument[]; onNavigate: (path: string) => void }) {
  if (backlinks.length === 0) return <div className="text-xs text-slate-400 italic">No notes link back to this document yet.</div>;
  return (
    <div className="space-y-2">
      {backlinks.map((link) => (
        <button key={link.id} onClick={() => onNavigate(`/docs/${link.id}`)} className="group w-full text-left p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 transition-colors">
          <div className="font-bold text-xs text-slate-700 line-clamp-1 group-hover:text-indigo-600 transition-colors">{link.title || "Untitled"}</div>
          <div className="text-[10px] text-slate-400 font-mono mt-1">{formatDate(link.mtime || link.ctime)}</div>
        </button>
      ))}
    </div>
  );
}

function GraphView(props: {
  linkGraph: FloatingPanelProps["linkGraph"];
  backlinks: MnoteDocument[];
  outboundLinks: MnoteDocument[];
  onNavigate: (path: string) => void;
}) {
  const { linkGraph, backlinks, outboundLinks, onNavigate } = props;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500"><Network className="h-3 w-3" />Link Graph</div>
      <div className="relative h-64 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {linkGraph.edges.map((edge, i) => {
            const fromPos = linkGraph.positionByID[edge.from]; const toPos = linkGraph.positionByID[edge.to];
            return <line key={`${edge.from}-${edge.to}-${i}`} x1={fromPos.x} y1={fromPos.y} x2={toPos.x} y2={toPos.y} stroke="rgba(100,116,139,0.45)" strokeWidth="0.7" />;
          })}
        </svg>
        {linkGraph.nodes.map((node) => {
          if (node.kind === "current") {
            return <div key={node.id} className="absolute z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-indigo-500 bg-indigo-600 shadow-sm" style={{ left: `${node.x}%`, top: `${node.y}%` }} title={`Current: ${node.title}`} />;
          }
          return (
            <button key={node.id} onClick={() => onNavigate(`/docs/${node.id}`)} className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-lg border px-1.5 py-1 text-center text-[9px] font-medium leading-tight shadow-sm w-[72px] truncate ${node.kind === "incoming" ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300" : node.kind === "outgoing" ? "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300" : "border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300"}`} style={{ left: `${node.x}%`, top: `${node.y}%` }} title={node.title}>
              {node.title}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[10px] text-slate-500"><span>Inbound: {backlinks.length}</span><span>Outbound: {outboundLinks.length}</span></div>
    </div>
  );
}
