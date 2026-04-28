"use client";

import React, { memo, useMemo, useEffect } from "react";
import { Copy, Check, Maximize2, X, Bug } from "lucide-react";
import Mermaid from "@/components/mermaid";
import { copyToClipboard } from "./helpers";

type SvgMetrics = {
  svgFound: boolean;
  svgWidth: number;
  svgHeight: number;
  rectWidth: number;
  rectHeight: number;
  viewBox: string;
  containerWidth: number;
  containerHeight: number;
  svgLength: number;
  baseScale: number;
  displayWidth: number;
  displayHeight: number;
};

const KNOWN_DIAGRAM_TYPES: Record<string, string> = {
  graph: "FLOWCHART",
  flowchart: "FLOWCHART",
  sequenceDiagram: "SEQUENCE DIAGRAM",
  classDiagram: "CLASS DIAGRAM",
  stateDiagram: "STATE DIAGRAM",
  erDiagram: "ER DIAGRAM",
  gantt: "GANTT CHART",
  pie: "PIE CHART",
  gitGraph: "GIT GRAPH",
  journey: "JOURNEY",
  quadrantChart: "QUADRANT CHART",
  xychart: "XY CHART",
  mindmap: "MINDMAP",
  timeline: "TIMELINE",
  sankey: "SANKEY",
  packet: "PACKET DIAGRAM",
  kanban: "KANBAN",
  architecture: "ARCHITECTURE",
};

function readSvgNaturalSize(svg: SVGElement): { width: number; height: number } | null {
  const svgEl = svg as SVGSVGElement;
  const viewBox = svgEl.viewBox.baseVal;
  if (viewBox.width && viewBox.height) {
    return { width: viewBox.width, height: viewBox.height };
  }
  try {
    const box = (svg as SVGGraphicsElement).getBBox();
    if (box.width && box.height) return { width: box.width, height: box.height };
  } catch {
    return null;
  }
  return null;
}

function ensureSvgHasRenderedSize(svg: SVGElement, naturalWidth: number, naturalHeight: number) {
  const rect = svg.getBoundingClientRect();
  if (rect.width && rect.height) {
    return { rectWidth: rect.width, rectHeight: rect.height };
  }
  const svgEl = svg as SVGSVGElement;
  svgEl.setAttribute("width", `${naturalWidth}`);
  svgEl.setAttribute("height", `${naturalHeight}`);
  svgEl.style.width = `${naturalWidth}px`;
  svgEl.style.height = `${naturalHeight}px`;
  svgEl.style.maxWidth = "none";
  svgEl.style.maxHeight = "none";
  svgEl.style.display = "block";
  return { rectWidth: naturalWidth, rectHeight: naturalHeight };
}

function measureSvgInContainer(
  container: HTMLDivElement,
  zoomLevel: number,
): { baseScale: number; svgSize: { width: number; height: number }; metrics: SvgMetrics } | null {
  const svg = container.querySelector("svg");
  if (!svg) return null;

  const natural = readSvgNaturalSize(svg);
  if (!natural) return null;

  const { rectWidth, rectHeight } = ensureSvgHasRenderedSize(svg, natural.width, natural.height);

  const styles = window.getComputedStyle(container);
  const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
  const paddingY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
  const availableWidth = Math.max(0, container.clientWidth - paddingX);
  const availableHeight = Math.max(0, container.clientHeight - paddingY);
  if (!availableWidth || !availableHeight) return null;

  const next = Math.min(1, availableWidth / natural.width, availableHeight / natural.height);
  if (!Number.isFinite(next) || next <= 0) return null;

  const vb = svg.viewBox.baseVal;

  return {
    baseScale: next,
    svgSize: natural,
    metrics: {
      svgFound: true,
      svgWidth: natural.width,
      svgHeight: natural.height,
      rectWidth,
      rectHeight,
      viewBox: vb.width ? `${vb.x} ${vb.y} ${vb.width} ${vb.height}` : "",
      containerWidth: container.clientWidth,
      containerHeight: container.clientHeight,
      svgLength: svg.outerHTML.length,
      baseScale: next,
      displayWidth: natural.width * next * zoomLevel,
      displayHeight: natural.height * next * zoomLevel,
    },
  };
}

const EMPTY_METRICS: SvgMetrics = {
  svgFound: false, svgWidth: 0, svgHeight: 0, rectWidth: 0, rectHeight: 0,
  viewBox: "", containerWidth: 0, containerHeight: 0, svgLength: 0,
  baseScale: 0, displayWidth: 0, displayHeight: 0,
};

function DebugOverlay({ info, baseScale, zoomLevel }: { info: SvgMetrics | null; baseScale: number; zoomLevel: number }) {
  const m = info ?? EMPTY_METRICS;
  return (
    <div className="absolute right-3 top-3 z-10 rounded-lg border border-border bg-background/90 p-2 text-[10px] font-mono text-muted-foreground shadow-sm">
      <div>svg: {m.svgFound ? "found" : "missing"}</div>
      <div>svg size: {m.svgWidth} × {m.svgHeight}</div>
      <div>rect: {m.rectWidth} × {m.rectHeight}</div>
      <div>viewBox: {m.viewBox || "-"}</div>
      <div>container: {m.containerWidth} × {m.containerHeight}</div>
      <div>svg len: {m.svgLength}</div>
      <div>base: {(m.baseScale || baseScale).toFixed(2)}</div>
      <div>zoom: {zoomLevel.toFixed(2)}</div>
      <div>final: {(baseScale * zoomLevel).toFixed(2)}</div>
      <div>display: {m.displayWidth.toFixed(1)} × {m.displayHeight.toFixed(1)}</div>
    </div>
  );
}

function getModalBodyClassName(zoomLevel: number, isDragging: boolean) {
  const overflow = zoomLevel > 1 ? "overflow-auto" : "overflow-hidden";
  let cursor = "cursor-default";
  if (zoomLevel > 1) cursor = isDragging ? "cursor-grabbing" : "cursor-grab";
  return `relative flex-1 p-4 bg-card/30 mermaid-zoom select-none ${overflow} ${cursor}`;
}

const MermaidModal = memo(({
  chart,
  diagramType,
  onClose,
}: {
  chart: string;
  diagramType: string;
  onClose: () => void;
}) => {
  const [zoomLevel, setZoomLevel] = React.useState(1);
  const modalBodyRef = React.useRef<HTMLDivElement | null>(null);
  const [baseScale, setBaseScale] = React.useState(1);
  const [showDebug, setShowDebug] = React.useState(false);
  const [debugInfo, setDebugInfo] = React.useState<SvgMetrics | null>(null);
  const [svgSize, setSvgSize] = React.useState<{ width: number; height: number } | null>(null);
  const [panOffset, setPanOffset] = React.useState({ x: 0, y: 0 });
  const dragStateRef = React.useRef({ dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const normalized = chart.trim();

  const updateBaseScale = React.useCallback(() => {
    const container = modalBodyRef.current;
    if (!container) return;
    const result = measureSvgInContainer(container, zoomLevel);
    if (!result) {
      setDebugInfo((prev) => ({
        svgFound: false, svgWidth: 0, svgHeight: 0, rectWidth: 0, rectHeight: 0,
        viewBox: "", containerWidth: container.clientWidth, containerHeight: container.clientHeight,
        svgLength: 0, baseScale: prev?.baseScale ?? 1, displayWidth: 0, displayHeight: 0,
      }));
      return;
    }
    setBaseScale((prev) => (Math.abs(prev - result.baseScale) > 0.01 ? result.baseScale : prev));
    setSvgSize(result.svgSize);
    setDebugInfo(result.metrics);
  }, [zoomLevel]);

  useEffect(() => {
    let raf = 0;
    let retries = 0;
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        updateBaseScale();
        if (retries < 20) { retries += 1; schedule(); }
      });
    };
    const container = modalBodyRef.current;
    if (!container) return;
    const resizeObserver = new ResizeObserver(() => updateBaseScale());
    resizeObserver.observe(container);
    schedule();
    return () => { if (raf) cancelAnimationFrame(raf); resizeObserver.disconnect(); };
  }, [updateBaseScale]);

  const handleZoomWheel = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    setZoomLevel((prev) => Math.round(Math.min(3, Math.max(0.5, prev + delta)) * 10) / 10);
  }, []);

  const handlePanStart = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (zoomLevel <= 1) return;
    dragStateRef.current = {
      dragging: true, startX: event.clientX, startY: event.clientY,
      originX: panOffset.x, originY: panOffset.y,
    };
    setIsDragging(true);
  }, [zoomLevel, panOffset]);

  const handlePanMove = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.dragging) return;
    setPanOffset({
      x: dragStateRef.current.originX + event.clientX - dragStateRef.current.startX,
      y: dragStateRef.current.originY + event.clientY - dragStateRef.current.startY,
    });
  }, []);

  const handlePanEnd = React.useCallback(() => {
    if (!dragStateRef.current.dragging) return;
    dragStateRef.current.dragging = false;
    setIsDragging(false);
  }, []);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[95vw] max-w-none h-[90vh] bg-background border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
          <span className="text-[10px] font-bold text-muted-foreground/70 tracking-widest font-mono uppercase">
            {diagramType}
          </span>
          <div className="flex items-center gap-2">
            <button
              className={`h-8 w-8 flex items-center justify-center rounded-full border transition-colors ${showDebug ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}
              onClick={() => setShowDebug((prev) => !prev)}
              title="Toggle debug"
            >
              <Bug className="h-4 w-4" />
            </button>
            <button
              className="h-8 w-8 flex items-center justify-center hover:bg-muted rounded-full transition-colors"
              onClick={onClose}
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div
          ref={modalBodyRef}
          className={getModalBodyClassName(zoomLevel, isDragging)}
          onWheel={handleZoomWheel}
          onMouseDown={handlePanStart}
          onMouseMove={handlePanMove}
          onMouseUp={handlePanEnd}
          onMouseLeave={handlePanEnd}
          onDoubleClick={() => { setZoomLevel(1); setPanOffset({ x: 0, y: 0 }); }}
        >
          {showDebug && <DebugOverlay info={debugInfo} baseScale={baseScale} zoomLevel={zoomLevel} />}
          <div className="min-h-full w-full flex items-center justify-center">
            <div
              className="inline-block"
              style={{
                width: svgSize ? `${svgSize.width * baseScale * zoomLevel}px` : undefined,
                height: svgSize ? `${svgSize.height * baseScale * zoomLevel}px` : undefined,
                outline: showDebug ? "1px dashed rgba(59,130,246,0.6)" : undefined,
                transform: `translate(${panOffset.x}px, ${panOffset.y}px)`
              }}
            >
              <Mermaid key={`modal-${normalized}`} chart={chart} cacheKey={`modal:${chart}`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

MermaidModal.displayName = "MermaidModal";

const MermaidBlock = memo(({ chart }: { chart: string }) => {
  const [copied, setCopied] = React.useState(false);
  const [showModal, setShowModal] = React.useState(false);
  const normalized = chart.trim();

  const handleCopyLocal = React.useCallback(() => {
    void copyToClipboard(chart).then((ok) => {
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 1000);
      }
    });
  }, [chart]);

  const diagramType = useMemo(() => {
    const match = normalized.match(/^(\w+)/);
    if (!match) return "DIAGRAM";
    const type = match[1];
    return KNOWN_DIAGRAM_TYPES[type] || type.replace(/([A-Z])/g, ' $1').trim().toUpperCase();
  }, [normalized]);

  return (
    <>
      <div
        style={{
          margin: 0,
          marginBottom: "1.5em",
          borderRadius: "var(--radius-md)",
          backgroundColor: "#f8f9fa",
          border: "1px solid rgba(0,0,0,0.06)",
          boxShadow: "none",
          position: "relative",
          overflow: "hidden"
        }}
      >
        <div className="flex items-center justify-between px-3 h-8 bg-black/[0.02] border-b border-black/[0.03]">
          <span className="text-[10px] font-bold text-muted-foreground/50 tracking-wide font-mono uppercase">
            {diagramType}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setShowModal(true);
              }}
              className="h-6 w-6 flex items-center justify-center rounded-md border border-transparent hover:border-border hover:bg-background transition-all"
              title="Open preview"
            >
              <Maximize2 className="h-3 w-3 text-muted-foreground/50" />
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleCopyLocal();
              }}
              className="h-6 w-6 flex items-center justify-center rounded-md border border-transparent hover:border-border hover:bg-background transition-all"
              title="Copy"
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground/50" />
              )}
            </button>
          </div>
        </div>
        <div className="p-4 flex justify-center">
          {normalized && normalized !== "undefined" ? (
            <Mermaid key={normalized} chart={chart} cacheKey={`inline:${chart}`} />
          ) : (
            <div className="text-xs text-muted-foreground">Waiting for mermaid content...</div>
          )}
        </div>
      </div>
      {showModal && (
        <MermaidModal chart={chart} diagramType={diagramType} onClose={() => setShowModal(false)} />
      )}
    </>
  );
});

MermaidBlock.displayName = "MermaidBlock";

export default MermaidBlock;
