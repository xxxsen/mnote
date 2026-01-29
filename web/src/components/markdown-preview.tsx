"use client";

import React, { useMemo, forwardRef, memo, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import oneLight from "react-syntax-highlighter/dist/esm/styles/prism/one-light";
import Mermaid from "@/components/mermaid";
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
const allowedHtmlTags = new Set(["span", "u", "br", "details", "summary", "center"]);

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
          if (lowerAttrs.includes("on") || lowerAttrs.includes("javascript:")) {
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
  const minLevel = headings.reduce((min, heading) => Math.min(min, heading.level), headings[0].level);
  return headings
    .map((heading) => {
      const normalizedLevel = heading.level - minLevel + 1;
      const indent = "  ".repeat(Math.max(0, normalizedLevel - 1));
      const slug = heading.id || createSlugger()(heading.text);
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

  const handleCopyLocal = React.useCallback(() => {
    const onSuccess = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(rawCode).then(onSuccess).catch(() => {
        const textarea = document.createElement("textarea");
        textarea.value = rawCode;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (ok) onSuccess();
      });
    }
  }, [rawCode]);

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
          className="text-[10px] px-2 h-5 flex items-center justify-center rounded border border-transparent hover:border-border bg-transparent hover:bg-background text-muted-foreground/40 hover:text-foreground transition-all min-w-[50px] font-bold tracking-tighter"
        >
          {copied ? "COPIED" : "COPY"}
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
          }}
          codeTagProps={{
            style: {
              border: "none",
              boxShadow: "none",
              background: "transparent",
              padding: 0,
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

  const handleCopyLocal = React.useCallback(() => {
    const onSuccess = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(chart).then(onSuccess).catch(() => {
        const textarea = document.createElement("textarea");
        textarea.value = chart;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (ok) onSuccess();
      });
    }
  }, [chart]);

  const diagramType = useMemo(() => {
    const match = chart.trim().match(/^(\w+)/);
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
  }, [chart]);

  return (
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
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            handleCopyLocal();
          }}
          className="text-[10px] px-2 h-5 flex items-center justify-center rounded border border-transparent hover:border-border bg-transparent hover:bg-background text-muted-foreground/40 hover:text-foreground transition-all min-w-[50px] font-bold tracking-tighter"
        >
          {copied ? "COPIED" : "COPY"}
        </button>
      </div>
      <div className="p-4 flex justify-center">
        <Mermaid chart={chart} />
      </div>
    </div>
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
    
    const safeContent = escapeUnsupportedHtml(mathFixed);
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
          React.isValidElement<{ className?: string }>(children) &&
          children.props.className
        ) {
          const className = children.props.className;
          const isToc = className.includes("language-toc");
          const isMermaid = className.includes("language-mermaid");
          if (isToc || isMermaid || className.includes("language-")) {
            return <>{children}</>;
          }
        }
        return <pre {...props}>{children}</pre>;
      },
      code({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
        const match = /language-(\S+)/.exec(className || "");
        const isMermaid = match && match[1] === "mermaid";
        const isToc = match && match[1] === "toc";

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
          return <MermaidBlock chart={String(children).replace(/\n$/, "")} />;
        }

        if (match) {
          const { inline: _inline, node: _node, ...rest } =
            props as React.HTMLAttributes<HTMLElement> & {
              inline?: boolean;
              node?: HastNode;
            };
          void _inline;
          
          const languageMatch = match[1];
          let language = languageMatch;
          let fileName = "";

          if (language.includes(":")) {
            const parts = language.split(":");
            language = parts[0];
            fileName = parts[1];
          } else if (_node?.data?.meta) {
            fileName = _node.data.meta;
          }

          const rawCode = Array.isArray(children)
            ? children.join("")
            : String(children).replace(/\n$/, "");

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
          <code className={className} {...props}>
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
        if (alt && alt.startsWith("PIC:")) {
          filename = alt.replace("PIC:", "");
        } else if (src) {
          try {
            const url = new URL(src as string, "http://dummy.com");
            const parts = url.pathname.split("/");
            const last = parts[parts.length - 1];
            if (last) filename = decodeURIComponent(last);
          } catch {}
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
    }),
    []
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const remarkPlugins = useMemo<any[]>(
    () => [remarkGfm, [remarkMath, { singleDollarTextMath: true }], remarkSoftBreaks],
    []
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rehypePlugins = useMemo<any[]>(() => [rehypeRaw, [rehypeKatex, { strict: "warn" }], rehypeSlugger], [rehypeSlugger]);

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
