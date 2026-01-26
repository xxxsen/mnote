"use client";

import React, { useMemo, forwardRef, memo, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
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
const allowedHtmlTags = new Set(["span", "u", "br"]);

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

const getText = (value: React.ReactNode): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(getText).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(value)) {
    return getText(value.props.children);
  }
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
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({ level: match[1].length, text: match[2].trim() });
    }
  }
  return headings;
};

const buildTocMarkdown = (headings: Heading[]) => {
  if (headings.length === 0) return "";
  return headings
    .map((heading) => {
      const indent = "  ".repeat(Math.max(0, heading.level - 1));
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
      return line.replace(/<\/?([a-zA-Z0-9-]+)([^>]*)>/g, (match, tagName) => {
        const name = String(tagName).toLowerCase();
        if (allowedHtmlTags.has(name)) {
          return match;
        }
        return match.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      });
    })
    .join("\n");
};

const MarkdownPreview = memo(
  forwardRef<HTMLDivElement, MarkdownPreviewProps>(function MarkdownPreview(
    { content, className, showTocAside = false, tocClassName, onScroll, onTocLoaded },
    ref
  ) {
  const { processedContent, headingIds, tocMarkdown } = useMemo(() => {
    const headings = extractHeadings(content);
    const slugger = createSlugger();
    const headingsWithIds = headings.map((heading) => ({
      ...heading,
      id: slugger(heading.text),
    }));
    const toc = buildTocMarkdown(headingsWithIds);
    const updated = injectToc(content, toc);
    const safeContent = escapeUnsupportedHtml(updated);
    return { processedContent: safeContent, headingIds: headingsWithIds.map((h) => h.id || ""), tocMarkdown: toc };
  }, [content]);

  const headingIndexRef = React.useRef(0);

  React.useEffect(() => {
    headingIndexRef.current = 0;
  }, [content]);

  useEffect(() => {
    onTocLoaded?.(tocMarkdown);
  }, [tocMarkdown, onTocLoaded]);

  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const copyTimeoutRef = React.useRef<number | null>(null);

  const handleCopy = React.useCallback((id: string, text: string) => {
    if (copyTimeoutRef.current) {
      window.clearTimeout(copyTimeoutRef.current);
    }
    const onSuccess = () => {
      setCopiedId(id);
      copyTimeoutRef.current = window.setTimeout(() => setCopiedId(null), 1200);
    };
    const fallbackCopy = () => {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      if (ok) {
        onSuccess();
      }
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(onSuccess).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  let codeBlockIndex = 0;

  return (
    <div className={cn("relative h-full min-h-0 w-full", showTocAside ? "flex gap-8" : "")}>
      <div
        ref={ref}
        onScroll={onScroll}
        className={cn(
          "markdown-body p-8 overflow-y-auto bg-background text-foreground h-full flex-1 min-w-0",
          className
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={{
          pre({ children, ...props }) {
            if (
              React.isValidElement<{ className?: string }>(children) &&
              children.props.className
            ) {
              const className = children.props.className;
              const isToc = className.includes("language-toc");
              const isMermaid = className.includes("language-mermaid");
              if (isToc || (className.includes("language-") && !isMermaid)) {
                return <>{children}</>;
              }
            }
            return <pre {...props}>{children}</pre>;
          },
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
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
              return <Mermaid chart={String(children).replace(/\n$/, "")} />;
            }

            if (match) {
              const { inline: _inline, node: _node, ...rest } =
                props as React.HTMLAttributes<HTMLElement> & {
                  inline?: boolean;
                  node?: unknown;
                };
              void _inline;
              void _node;
              const rawCode = Array.isArray(children)
                ? children.join("")
                : String(children).replace(/\n$/, "");
              const blockId = `${match[1]}-${codeBlockIndex++}`;
              return (
                <div
                  style={{
                    margin: 0,
                    marginBottom: "1.5em",
                    padding: "1rem",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "#f6f8fa",
                    border: "1px solid rgba(0,0,0,0.05)",
                    boxShadow: "none",
                    position: "relative",
                  }}
                >
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      handleCopy(blockId, rawCode);
                    }}
                    className="absolute top-2 right-2 z-10 pointer-events-auto text-xs px-2 py-1 rounded border border-border bg-background/80 text-muted-foreground hover:text-foreground hover:bg-background"
                  >
                    {copiedId === blockId ? "Copied" : "Copy"}
                  </button>
                  <ThemedSyntaxHighlighter
                    language={match[1]}
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
              );
            }

            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          h1({ children }) {
            const text = getText(children);
            const id = headingIds[headingIndexRef.current++] || createSlugger()(text);
            return <h1 id={id}>{children}</h1>;
          },
          h2({ children }) {
            const text = getText(children);
            const id = headingIds[headingIndexRef.current++] || createSlugger()(text);
            return <h2 id={id}>{children}</h2>;
          },
          h3({ children }) {
            const text = getText(children);
            const id = headingIds[headingIndexRef.current++] || createSlugger()(text);
            return <h3 id={id}>{children}</h3>;
          },
          h4({ children }) {
            const text = getText(children);
            const id = headingIds[headingIndexRef.current++] || createSlugger()(text);
            return <h4 id={id}>{children}</h4>;
          },
          h5({ children }) {
            const text = getText(children);
            const id = headingIds[headingIndexRef.current++] || createSlugger()(text);
            return <h5 id={id}>{children}</h5>;
          },
          h6({ children }) {
            const text = getText(children);
            const id = headingIds[headingIndexRef.current++] || createSlugger()(text);
            return <h6 id={id}>{children}</h6>;
          },
          img({ src, alt, title, ...props }) {
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
        }}
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
