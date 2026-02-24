"use client";

import React, { useMemo, forwardRef, memo, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import oneLight from "react-syntax-highlighter/dist/esm/styles/prism/one-light";
import { Copy, Check, Maximize2, X, Bug } from "lucide-react";
import Mermaid from "@/components/mermaid";
import { CodeSandbox } from "@/components/code-sandbox";
import { cn } from "@/lib/utils";

interface MarkdownPreviewProps {
  content: string;
  className?: string;
  showTocAside?: boolean;
  tocClassName?: string;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
  onTocLoaded?: (toc: string) => void;
}

type Heading = {
  level: number;
  text: string;
  id?: string;
};

const tocTokenRegex = /^\[(toc|TOC)]$/;
const allowedHtmlTags = new Set(["span", "u", "br", "details", "summary", "center", "font", "div"]);

export const FONT_SIZE_MAP: Record<string, string> = {
  "1": "0.625rem",
  "2": "0.8125rem",
  "3": "1rem",
  "4": "1.125rem",
  "5": "1.5rem",
  "6": "2rem",
  "7": "3rem",
};

export const toSafeInlineStyle = (value: unknown): React.CSSProperties => {
  if (!value) return {};

  const applyStyle = (acc: React.CSSProperties, propName: string, propValue: unknown) => {
    const prop = propName.trim().toLowerCase();
    const nextValue = String(propValue ?? "").trim();
    if (!nextValue) return;
    if (prop === "color") acc.color = nextValue;
    if (prop === "font-size" || prop === "fontsize") acc.fontSize = nextValue;
  };

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce<React.CSSProperties>((acc, [k, v]) => {
      applyStyle(acc, k, v);
      return acc;
    }, {});
  }

  if (typeof value !== "string") return {};

  return value
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce<React.CSSProperties>((acc, declaration) => {
      const colonIdx = declaration.indexOf(":");
      if (colonIdx < 0) return acc;
      const rawProp = declaration.slice(0, colonIdx);
      const rawVal = declaration.slice(colonIdx + 1);
      if (!rawProp || !rawVal) return acc;
      applyStyle(acc, rawProp, rawVal);
      return acc;
    }, {});
};

export const toFontSize = (value?: string | number) => {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim();
  if (!normalized) return undefined;
  return FONT_SIZE_MAP[normalized] ?? normalized;
};

export const convertAdmonitions = (content: string) => {
  const lines = content.split("\n");
  const result: string[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }

    if (!inCodeBlock && /^:::\s*warning\s*$/i.test(trimmed)) {
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== ":::") {
        body.push(lines[j]);
        j += 1;
      }

      if (j < lines.length && lines[j].trim() === ":::") {
        result.push('<div class="md-alert md-alert-warning">');
        result.push(...body);
        result.push("</div>");
        i = j;
        continue;
      }
    }

    result.push(line);
  }

  return result.join("\n");
};

const escapeUnsupportedHtml = (content: string) => {
  const lines = content.split("\n");
  let inCodeBlock = false;
  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("```")) {
        inCodeBlock = !inCodeBlock;
        return line;
      }
      if (inCodeBlock) return line;

      return line.replace(/<(\/?)([a-zA-Z0-9-]+)([^>]*)>/g, (match, slash, tagName, attrs) => {
        const name = String(tagName).toLowerCase();
        if (allowedHtmlTags.has(name)) {
          const lowerAttrs = attrs.toLowerCase();
          if (/\bon[a-z]+\s*=/i.test(lowerAttrs) || lowerAttrs.includes("javascript:")) {
            return `<${slash}${name}>`;
          }
          return match;
        }
        return match.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      });
    })
    .join("\n");
};

type ThemedSyntaxHighlighterProps = Omit<
  React.ComponentProps<typeof SyntaxHighlighter>,
  "style"
> & {
  style?: React.CSSProperties | Record<string, React.CSSProperties>;
};

const ThemedSyntaxHighlighter =
  SyntaxHighlighter as unknown as React.ComponentType<ThemedSyntaxHighlighterProps>;


const createSlugger = () => {
  const counts = new Map<string, number>();
  return (value: string) => {
    const base = value
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    const normalized = base || "section";
    const count = counts.get(normalized) || 0;
    counts.set(normalized, count + 1);
    return count === 0 ? normalized : `${normalized}-${count}`;
  };
};

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  properties?: Record<string, any>;
  children?: HastNode[];
  data?: {
    meta?: string;
  };
};

type MdastNode = {
  type: string;
  value?: string;
  children?: MdastNode[];
};

type InlineHtmlNode = {
  properties?: Record<string, unknown>;
};

const remarkSoftBreaks = () => {
  return (tree: MdastNode) => {
    const walk = (node: MdastNode) => {
      if (!node || !node.children) return;
      const next: MdastNode[] = [];
      for (const child of node.children) {
        if (child.type === "code" || child.type === "inlineCode") {
          next.push(child);
          continue;
        }
        if (child.type === "text" && typeof child.value === "string" && child.value.includes("\n")) {
          const parts = child.value.split("\n");
          for (let i = 0; i < parts.length; i += 1) {
            const value = parts[i];
            if (value) next.push({ ...child, value });
            if (i < parts.length - 1) next.push({ type: "break" });
          }
          continue;
        }
        walk(child);
        next.push(child);
      }
      node.children = next;
    };
    walk(tree);
  };
};

const rehypeCodeMeta = () => (tree: HastNode) => {
  const walk = (node: HastNode) => {
    if (node.type === "element" && node.tagName === "code") {
      if (node.data && node.data.meta) {
        node.properties = node.properties || {};
        node.properties.metastring = node.data.meta;
      }
    }
    if (node.children) {
      node.children.forEach(walk);
    }
  };
  walk(tree);
};

const getHastText = (node: HastNode): string => {
  if (node.type === "text") return node.value || "";
  if (node.children) return node.children.map(getHastText).join("");
  return "";
};

const extractHeadings = (content: string) => {
  const headings: Heading[] = [];
  const lines = content.split("\n");
  let inCodeBlock = false;

  for (const line of lines) {
    const fenceMatch = line.trim().match(/^```/);
    if (fenceMatch) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const match = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({ level: match[1].length, text: match[2].trim() });
    }
  }
  return headings;
};

const buildTocMarkdown = (headings: Heading[]) => {
  if (headings.length === 0) return "";
  // Use the first heading as the baseline to avoid starting with deep indentation
  // which can be misinterpreted as a code block in markdown.
  const firstLevel = headings[0].level;
  const slugger = createSlugger();

  return headings
    .map((heading) => {
      const normalizedLevel = Math.max(1, heading.level - firstLevel + 1);
      const indent = "  ".repeat(normalizedLevel - 1);
      const slug = heading.id || slugger(heading.text);
      return `${indent}- [${heading.text}](#${slug})`;
    })
    .join("\n");
};

const injectToc = (content: string, toc: string) => {
  if (!toc) return content.replace(/\[(toc|TOC)]/g, "");
  const lines = content.split("\n");
  let inCodeBlock = false;
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }
    if (!inCodeBlock && tocTokenRegex.test(trimmed)) {
      result.push("```toc\n" + toc + "\n```");
      continue;
    }
    result.push(line);
  }
  return result.join("\n");
};

interface CodeBlockProps {
  language: string;
  fileName: string;
  rawCode: string;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  [key: string]: any;
}

const CodeBlock = memo(({ language, fileName, rawCode, ...rest }: CodeBlockProps) => {
  const [copied, setCopied] = React.useState(false);

  const copyText = React.useCallback((value: string) => {
    const fallbackCopy = () => {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    };

    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(value).then(() => true).catch(() => fallbackCopy());
    }

    return Promise.resolve(fallbackCopy());
  }, []);

  const handleCopyLocal = React.useCallback(() => {
    const onSuccess = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    };

    void copyText(rawCode).then((ok) => {
      if (ok) onSuccess();
    });
  }, [copyText, rawCode]);

  const displayLanguage = language.toUpperCase();
  const displayTitle = fileName || displayLanguage;

  return (
    <div
      className="group"
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
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 font-mono">
          {displayTitle}
        </span>
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
      <div className="p-3 pt-2">
        <ThemedSyntaxHighlighter
          language={language}
          style={oneLight}
          PreTag="pre"
          customStyle={{
            margin: 0,
            padding: 0,
            background: "transparent",
            boxShadow: "none",
            border: "none",
            tabSize: 4,
            MozTabSize: 4,
          }}
          codeTagProps={{
            style: {
              border: "none",
              boxShadow: "none",
              background: "transparent",
              padding: 0,
              tabSize: 4,
              MozTabSize: 4,
            },
          }}
          {...rest}
        >
          {rawCode}
        </ThemedSyntaxHighlighter>
      </div>
    </div>
  );
});

CodeBlock.displayName = "CodeBlock";

const MermaidBlock = memo(({ chart }: { chart: string }) => {
  const [copied, setCopied] = React.useState(false);
  const [showModal, setShowModal] = React.useState(false);
  const [zoomLevel, setZoomLevel] = React.useState(1);
  const modalBodyRef = React.useRef<HTMLDivElement | null>(null);
  const [baseScale, setBaseScale] = React.useState(1);
  const [showDebug, setShowDebug] = React.useState(false);
  const [debugInfo, setDebugInfo] = React.useState<{
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
  } | null>(null);
  const [svgSize, setSvgSize] = React.useState<{ width: number; height: number } | null>(null);
  const [panOffset, setPanOffset] = React.useState({ x: 0, y: 0 });
  const dragStateRef = React.useRef({ dragging: false, startX: 0, startY: 0, originX: 0, originY: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const normalized = chart.trim();

  const copyText = React.useCallback((value: string) => {
    const fallbackCopy = () => {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    };

    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(value).then(() => true).catch(() => fallbackCopy());
    }

    return Promise.resolve(fallbackCopy());
  }, []);

  const handleCopyLocal = React.useCallback(() => {
    const onSuccess = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    };

    void copyText(chart).then((ok) => {
      if (ok) onSuccess();
    });
  }, [chart, copyText]);

  const diagramType = useMemo(() => {
    const match = normalized.match(/^(\w+)/);
    if (!match) return "DIAGRAM";
    const type = match[1];

    const knownTypes: Record<string, string> = {
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
      architecture: "ARCHITECTURE"
    };

    return knownTypes[type] || type.replace(/([A-Z])/g, ' $1').trim().toUpperCase();
  }, [normalized]);

  const updateBaseScale = React.useCallback(() => {
    const container = modalBodyRef.current;
    if (!container) return;
    const svg = container.querySelector("svg");
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    if (!svg) {
      setDebugInfo((prev) => ({
        svgFound: false,
        svgWidth: 0,
        svgHeight: 0,
        rectWidth: 0,
        rectHeight: 0,
        viewBox: "",
        containerWidth,
        containerHeight,
        svgLength: 0,
        baseScale: prev?.baseScale ?? 1,
        displayWidth: 0,
        displayHeight: 0,
      }));
      return;
    }

    let svgWidth = 0;
    let svgHeight = 0;
    const viewBox = (svg as SVGSVGElement).viewBox?.baseVal;
    if (viewBox && viewBox.width && viewBox.height) {
      svgWidth = viewBox.width;
      svgHeight = viewBox.height;
    }
    if (!svgWidth || !svgHeight) {
      try {
        const box = (svg as SVGGraphicsElement).getBBox();
        svgWidth = box.width;
        svgHeight = box.height;
      } catch {
        return;
      }
    }
    if (!svgWidth || !svgHeight) return;

    const rect = svg.getBoundingClientRect();
    let rectWidth = rect.width;
    let rectHeight = rect.height;
    if (!rectWidth || !rectHeight) {
      const svgElement = svg as SVGSVGElement;
      svgElement.setAttribute("width", `${svgWidth}`);
      svgElement.setAttribute("height", `${svgHeight}`);
      svgElement.style.width = `${svgWidth}px`;
      svgElement.style.height = `${svgHeight}px`;
      svgElement.style.maxWidth = "none";
      svgElement.style.maxHeight = "none";
      svgElement.style.display = "block";
      rectWidth = svgWidth;
      rectHeight = svgHeight;
    }

    const styles = window.getComputedStyle(container);
    const paddingX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const paddingY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    const availableWidth = Math.max(0, container.clientWidth - paddingX);
    const availableHeight = Math.max(0, container.clientHeight - paddingY);
    if (!availableWidth || !availableHeight) return;

    const next = Math.min(1, availableWidth / svgWidth, availableHeight / svgHeight);
    if (!Number.isFinite(next) || next <= 0) return;
    setBaseScale((prev) => (Math.abs(prev - next) > 0.01 ? next : prev));
    setSvgSize({ width: svgWidth, height: svgHeight });
    const displayWidth = svgWidth * next * zoomLevel;
    const displayHeight = svgHeight * next * zoomLevel;
    setDebugInfo({
      svgFound: true,
      svgWidth,
      svgHeight,
      rectWidth,
      rectHeight,
      viewBox: viewBox ? `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}` : "",
      containerWidth,
      containerHeight,
      svgLength: svg.outerHTML.length,
      baseScale: next,
      displayWidth,
      displayHeight,
    });
  }, [zoomLevel]);

  useEffect(() => {
    if (!showModal) return;
    let raf = 0;
    let retries = 0;
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        updateBaseScale();
        if (retries < 20) {
          retries += 1;
          schedule();
        }
      });
    };
    const container = modalBodyRef.current;
    if (!container) return;
    const resizeObserver = new ResizeObserver(() => updateBaseScale());
    resizeObserver.observe(container);
    schedule();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      resizeObserver.disconnect();
    };
  }, [showModal, updateBaseScale]);



  const handleZoomWheel = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    setZoomLevel((prev) => {
      const next = Math.min(3, Math.max(0.5, prev + delta));
      return Math.round(next * 10) / 10;
    });
  }, []);

  const handlePanStart = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (zoomLevel <= 1) return;
    dragStateRef.current = {
      dragging: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: panOffset.x,
      originY: panOffset.y,
    };
    setIsDragging(true);
  }, [zoomLevel, panOffset]);

  const handlePanMove = React.useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.dragging) return;
    const dx = event.clientX - dragStateRef.current.startX;
    const dy = event.clientY - dragStateRef.current.startY;
    setPanOffset({
      x: dragStateRef.current.originX + dx,
      y: dragStateRef.current.originY + dy,
    });
  }, []);

  const handlePanEnd = React.useCallback(() => {
    if (!dragStateRef.current.dragging) return;
    dragStateRef.current.dragging = false;
    setIsDragging(false);
  }, []);

  const handlePanReset = React.useCallback(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

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
                setZoomLevel(1);
                setBaseScale(1);
                setPanOffset({ x: 0, y: 0 });
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />
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
                  onClick={() => setShowModal(false)}
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div
              ref={modalBodyRef}
              className={`relative flex-1 p-4 bg-card/30 mermaid-zoom select-none ${zoomLevel > 1 ? "overflow-auto" : "overflow-hidden"} ${zoomLevel > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default"}`}
              onWheel={handleZoomWheel}
              onMouseDown={handlePanStart}
              onMouseMove={handlePanMove}
              onMouseUp={handlePanEnd}
              onMouseLeave={handlePanEnd}
              onDoubleClick={handlePanReset}
            >
              {showDebug && (
                <div className="absolute right-3 top-3 z-10 rounded-lg border border-border bg-background/90 p-2 text-[10px] font-mono text-muted-foreground shadow-sm">
                  <div>svg: {debugInfo?.svgFound ? "found" : "missing"}</div>
                  <div>svg size: {debugInfo?.svgWidth ?? 0} × {debugInfo?.svgHeight ?? 0}</div>
                  <div>rect: {debugInfo?.rectWidth ?? 0} × {debugInfo?.rectHeight ?? 0}</div>
                  <div>viewBox: {debugInfo?.viewBox || "-"}</div>
                  <div>container: {debugInfo?.containerWidth ?? 0} × {debugInfo?.containerHeight ?? 0}</div>
                  <div>svg len: {debugInfo?.svgLength ?? 0}</div>
                  <div>base: {debugInfo?.baseScale?.toFixed(2) ?? baseScale.toFixed(2)}</div>
                  <div>zoom: {zoomLevel.toFixed(2)}</div>
                  <div>final: {(baseScale * zoomLevel).toFixed(2)}</div>
                  <div>display: {debugInfo?.displayWidth?.toFixed(1) ?? 0} × {debugInfo?.displayHeight?.toFixed(1) ?? 0}</div>
                </div>
              )}
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
      )}
    </>
  );
});

MermaidBlock.displayName = "MermaidBlock";

const MarkdownPreview = memo(
  forwardRef<HTMLDivElement, MarkdownPreviewProps>(function MarkdownPreview(
    { content, className, showTocAside = false, tocClassName, onScroll, onTocLoaded },
    ref
  ) {
    const { processedContent, tocMarkdown } = useMemo(() => {
      const headings = extractHeadings(content);
      const slugger = createSlugger();
      const headingsWithIds = headings.map((heading) => ({
        ...heading,
        id: slugger(heading.text),
      }));
      const toc = buildTocMarkdown(headingsWithIds);
      const updated = injectToc(content, toc);

      // Support \( ... \) and \[ ... \] by converting them to $ ... $ and $$ ... $$
      const mathFixed = updated
        .replace(/\\\((.*?)\\\)/g, '$$$1$$')
        .replace(/\\\[(.*?)\\\]/g, '$$$$$1$$$$');

      const safeContent = escapeUnsupportedHtml(convertAdmonitions(mathFixed));
      return { processedContent: safeContent, tocMarkdown: toc };
    }, [content]);

    const rehypeSlugger = useMemo(() => {
      return () => (tree: HastNode) => {
        const slugger = createSlugger();
        const walk = (node: HastNode) => {
          if (node.type === "element" && node.tagName && /^h[1-6]$/.test(node.tagName)) {
            const text = getHastText(node);
            node.properties = node.properties || {};
            if (!node.properties.id) {
              node.properties.id = slugger(text);
            }
          }
          if (node.children) {
            node.children.forEach(walk);
          }
        };
        walk(tree);
      };
    }, []);

    useEffect(() => {
      onTocLoaded?.(tocMarkdown);
    }, [tocMarkdown, onTocLoaded]);

    const markdownComponents = useMemo(
      () => ({
        pre({ children, ...props }: React.HTMLAttributes<HTMLPreElement>) {
          if (
            React.isValidElement(children)
          ) {
            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            const childProps = children.props as any;
            const className = (childProps.className as string) || "";
            const metastring = (childProps.metastring as string) || "";
            const isToc = className.includes("language-toc");
            const isMermaid = className.includes("language-mermaid");

            const runnableLangs = ["go", "golang", "js", "javascript", "py", "python"];
            const isRunnableLang = runnableLangs.some(lang => className.includes(`language-${lang}`));
            const isRunnable = (metastring && metastring.includes("[runnable]")) || className.includes("[runnable]");
            const isFenced = className.startsWith("language-");

            if (isToc || isMermaid || (isRunnableLang && isRunnable) || isFenced) {
              return <>{children}</>;
            }
          }
          return <pre {...props}>{children}</pre>;
        },
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        code(props: any) {
          const { className, children, metastring, ...rest } = props;
          const match = /language-(\S*)/.exec(className || "");
          const isMermaid = match && match[1] === "mermaid";
          const isToc = match && (match[1] === "toc" || match[1] === "TOC");

          if (isToc) {
            return (
              <nav className="toc-wrapper">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                  {String(children)}
                </ReactMarkdown>
              </nav>
            );
          }

          if (isMermaid) {
            const raw = typeof children === "string" ? children : String(children ?? "");
            return <MermaidBlock chart={raw.replace(/\n$/, "")} />;
          }

          if (match) {
            const languageMatch = match[1];
            let language = languageMatch || "text";
            let fileName = "";
            let isRunnable = false;

            const rawCode = Array.isArray(children)
              ? children.join("")
              : String(children).replace(/\n$/, "");

            if (language.includes(":")) {
              const parts = language.split(":");
              language = parts[0];
              fileName = parts[1];
            }

            const meta = metastring || "";
            if (meta.includes("[runnable]") || language.includes("[runnable]") || (className && className.includes("[runnable]"))) {
              isRunnable = true;
            }

            if (language.includes("[runnable]")) {
              language = language.replace("[runnable]", "");
            }

            if (!fileName && meta && !meta.includes("[runnable]")) {
              fileName = meta;
            }

            const runnableLangs = ["go", "golang", "js", "javascript", "py", "python"];
            if (isRunnable && runnableLangs.includes(language)) {
              return <CodeSandbox code={rawCode} language={language} fileName={fileName} />;
            }

            return (
              <CodeBlock
                language={language}
                fileName={fileName}
                rawCode={rawCode}
                {...rest}
              />
            );
          }

          return (
            <code className={className} {...rest}>
              {children}
            </code>
          );
        },

        h1({ id, children }: React.HTMLAttributes<HTMLHeadingElement>) {
          return <h1 id={id}>{children}</h1>;
        },
        h2({ id, children }: React.HTMLAttributes<HTMLHeadingElement>) {
          return <h2 id={id}>{children}</h2>;
        },
        h3({ id, children }: React.HTMLAttributes<HTMLHeadingElement>) {
          return <h3 id={id}>{children}</h3>;
        },
        h4({ id, children }: React.HTMLAttributes<HTMLHeadingElement>) {
          return <h4 id={id}>{children}</h4>;
        },
        h5({ id, children }: React.HTMLAttributes<HTMLHeadingElement>) {
          return <h5 id={id}>{children}</h5>;
        },
        h6({ id, children }: React.HTMLAttributes<HTMLHeadingElement>) {
          return <h6 id={id}>{children}</h6>;
        },
        img({ src, alt, title, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
          let filename = "";
          const isVideo = alt?.startsWith("VIDEO:");
          const isAudio = alt?.startsWith("AUDIO:");
          const isPic = alt?.startsWith("PIC:");

          if (isVideo || isAudio || isPic) {
            filename = alt!.replace(/^(VIDEO|AUDIO|PIC):/, "");
          } else if (src) {
            try {
              const url = new URL(src as string, "http://dummy.com");
              const parts = url.pathname.split("/");
              const last = parts[parts.length - 1];
              if (last) filename = decodeURIComponent(last);
            } catch { }
          }

          if (isVideo) {
            return (
              <span className="flex flex-col items-center w-full my-4 relative z-10">
                <video
                  src={src}
                  controls
                  className="max-w-full rounded-lg shadow-md bg-black"
                  preload="metadata"
                />
                {filename && (
                  <span className="text-xs text-muted-foreground font-mono opacity-80 break-all px-2 mt-2">
                    [VIDEO: {filename}]
                  </span>
                )}
              </span>
            );
          }

          if (isAudio) {
            return (
              <span className="flex flex-col items-center w-full my-4 relative z-10">
                <audio
                  src={src}
                  controls
                  className="w-full max-w-md"
                  preload="metadata"
                />
                {filename && (
                  <span className="text-xs text-muted-foreground font-mono opacity-80 break-all px-2 mt-2">
                    [AUDIO: {filename}]
                  </span>
                )}
              </span>
            );
          }

          return (
            <span className="inline-flex flex-col items-center max-w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt}
                title={title}
                {...props}
                style={{ marginBottom: "0.5rem" }}
              />
              {filename && (
                <span className="text-xs text-muted-foreground font-mono opacity-80 break-all px-2">
                  [{filename}]
                </span>
              )}
            </span>
          );
        },
        span({ node, style, children, ...props }: React.HTMLAttributes<HTMLSpanElement> & { node?: InlineHtmlNode }) {
          const inlineStyle = toSafeInlineStyle(style ?? node?.properties?.style);
          return (
            <span {...props} style={inlineStyle}>
              {children}
            </span>
          );
        },
        font({ node, color, size, style, children, ...props }: React.HTMLAttributes<HTMLElement> & { color?: string; size?: string; node?: HastNode }) {
          const rawColor = color ?? String(node?.properties?.color ?? "");
          const rawSize = (size ?? node?.properties?.size) as string | number | undefined;
          const inlineStyle = {
            ...toSafeInlineStyle(style ?? node?.properties?.style),
            ...(rawColor ? { color: rawColor } : {}),
            ...(rawSize ? { fontSize: toFontSize(rawSize) } : {}),
          } satisfies React.CSSProperties;

          return (
            <span {...props} style={inlineStyle}>
              {children}
            </span>
          );
        },
        div({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
          if (className?.split(/\s+/).includes("md-alert-warning")) {
            return (
              <div className="md-alert md-alert-warning" {...props}>
                {children}
              </div>
            );
          }

          return (
            <div className={className} {...props}>
              {children}
            </div>
          );
        },
      }),
      []
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const remarkPlugins = useMemo<any[]>(
      () => [remarkGfm, [remarkMath, { singleDollarTextMath: true }], remarkSoftBreaks],
      []
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rehypePlugins = useMemo<any[]>(() => [rehypeCodeMeta, rehypeRaw, [rehypeKatex, { strict: "warn" }], rehypeSlugger], [rehypeSlugger]);

    return (
      <div className={cn("relative h-full min-h-0 w-full", showTocAside ? "flex gap-8" : "")}>
        <div
          ref={ref}
          onScroll={onScroll}
          className={cn(
            "markdown-body px-6 py-4 overflow-y-auto bg-background text-foreground h-full flex-1 min-w-0",
            className
          )}
        >
          <ReactMarkdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={markdownComponents}
          >
            {processedContent}
          </ReactMarkdown>
        </div>
        {showTocAside && tocMarkdown && (
          <aside className={cn("toc-aside hidden lg:block", tocClassName)}>
            <div className="toc-wrapper">
              <ReactMarkdown>{tocMarkdown}</ReactMarkdown>
            </div>
          </aside>
        )}
      </div>
    );
  })
);

export default MarkdownPreview;
