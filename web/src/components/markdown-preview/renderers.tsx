"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { CodeSandbox } from "@/components/code-sandbox";
import CodeBlock from "./code-block";
import MermaidBlock from "./mermaid-block";
import WikilinkAnchor from "./wikilink-anchor";
import { toSafeInlineStyle, toFontSize } from "./helpers";
import { ADMONITION_STYLES, RUNNABLE_LANGS } from "./constants";
import type { AdmonitionType, HastNode, InlineHtmlNode } from "./types";

type OpenPreviewFn = (
  event: React.MouseEvent<HTMLAnchorElement>,
  title: string,
  href?: string,
) => void;

type ClosePreviewFn = () => void;

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function PreRenderer({ children, ...props }: any) {
  if (React.isValidElement(children)) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const childProps = children.props as any;
    const className = (childProps.className as string) || "";
    const metastring = (childProps.metastring as string) || "";
    const isToc = className.includes("language-toc");
    const isMermaid = className.includes("language-mermaid");

    let effectiveLang = "";
    const langInfoMatch = /language-(\S*)/.exec(className);
    if (langInfoMatch) effectiveLang = langInfoMatch[1];
    if (effectiveLang.includes(":")) {
      const lParts = effectiveLang.split(":");
      const numEnd = lParts.findIndex(p => !/^\d+$/.test(p));
      if (numEnd > 0) {
        const extM = lParts.slice(numEnd).join(":").match(/\.(\w+)$/);
        effectiveLang = extM ? extM[1] : lParts[numEnd];
      } else {
        effectiveLang = lParts[0];
      }
    }
    const isRunnableLang = RUNNABLE_LANGS.includes(effectiveLang);
    const isRunnable = (metastring && metastring.includes("[runnable]")) || className.includes("[runnable]");
    const isFenced = className.startsWith("language-");

    if (isToc || isMermaid || (isRunnableLang && isRunnable) || isFenced) {
      return <>{children}</>;
    }
  }
  return <pre {...props}>{children}</pre>;
}

function parseCodeLanguage(raw: string): { language: string; fileName: string } {
  let language = raw || "text";
  let fileName = "";

  if (!language.includes(":")) return { language, fileName };

  const parts = language.split(":");
  const numericPrefixEnd = parts.findIndex(p => !/^\d+$/.test(p));
  if (numericPrefixEnd > 0) {
    const filePath = parts.slice(numericPrefixEnd).join(":");
    const lineRange = parts.slice(0, numericPrefixEnd).join(":");
    fileName = `${filePath}:${lineRange}`;
    const extMatch = filePath.match(/\.(\w+)$/);
    language = extMatch ? extMatch[1] : "text";
  } else {
    language = parts[0];
    fileName = parts.slice(1).join(":");
  }

  return { language, fileName };
}

function parseRunnableFlag(
  language: string, fileName: string, metastring: string, className: string,
): { language: string; fileName: string; isRunnable: boolean } {
  const meta = metastring || "";
  const isRunnable = meta.includes("[runnable]") || language.includes("[runnable]") || className.includes("[runnable]");
  const cleanLang = language.includes("[runnable]") ? language.replace("[runnable]", "") : language;
  const effectiveFileName = (!fileName && meta && !meta.includes("[runnable]")) ? meta : fileName;
  return { language: cleanLang, fileName: effectiveFileName, isRunnable };
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function CodeRenderer(props: any) {
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
    const rawCode = Array.isArray(children)
      ? children.join("")
      : String(children).replace(/\n$/, "");

    const parsed = parseCodeLanguage(match[1]);
    const { language, fileName, isRunnable } = parseRunnableFlag(
      parsed.language, parsed.fileName, metastring || "", className || "",
    );

    if (isRunnable && RUNNABLE_LANGS.includes(language)) {
      return <CodeSandbox code={rawCode} language={language} fileName={fileName} />;
    }

    return <CodeBlock language={language} fileName={fileName} rawCode={rawCode} {...rest} />;
  }

  return (
    <code className={className} {...rest}>
      {children}
    </code>
  );
}

function extractMediaFilename(src: string | Blob | undefined, alt: string | undefined): string {
  const isMediaPrefix = alt?.startsWith("VIDEO:") || alt?.startsWith("AUDIO:") || alt?.startsWith("PIC:");
  if (isMediaPrefix) {
    return (alt ?? "").replace(/^(VIDEO|AUDIO|PIC):/, "");
  }
  if (!src || typeof src !== "string") return "";
  try {
    const url = new URL(src, "http://dummy.com");
    const parts = url.pathname.split("/");
    const last = parts[parts.length - 1];
    return last ? decodeURIComponent(last) : "";
  } catch {
    return "";
  }
}

function MediaCaption({ label, filename }: { label: string; filename: string }) {
  if (!filename) return null;
  return (
    <span className="text-xs text-muted-foreground font-mono opacity-80 break-all px-2 mt-2">
      [{label}: {filename}]
    </span>
  );
}

function ImgRenderer({ src, alt, title, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const filename = extractMediaFilename(src, alt);

  if (alt?.startsWith("VIDEO:")) {
    return (
      <span className="flex flex-col items-center w-full my-4 relative z-10">
        <video src={src} controls className="max-w-full rounded-lg shadow-md bg-black" preload="metadata" />
        <MediaCaption label="VIDEO" filename={filename} />
      </span>
    );
  }

  if (alt?.startsWith("AUDIO:")) {
    return (
      <span className="flex flex-col items-center w-full my-4 relative z-10">
        <audio src={src} controls className="w-full max-w-md" preload="metadata" />
        <MediaCaption label="AUDIO" filename={filename} />
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-center max-w-full">
      <img src={src} alt={alt} title={title} {...props} style={{ marginBottom: "0.5rem" }} />
      {filename && (
        <span className="text-xs text-muted-foreground font-mono opacity-80 break-all px-2">
          [{filename}]
        </span>
      )}
    </span>
  );
}

function HeadingRenderer(level: number) {
  const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
  return function Heading({ id, children }: React.HTMLAttributes<HTMLHeadingElement>) {
    return <Tag id={id}>{children}</Tag>;
  };
}

function SpanRenderer({ node, style, className, children, ...props }: React.HTMLAttributes<HTMLSpanElement> & { node?: InlineHtmlNode }) {
  const inlineStyle = toSafeInlineStyle(style ?? node?.properties?.style);
  return (
    <span {...props} className={className} style={inlineStyle}>
      {children}
    </span>
  );
}

function FontRenderer({ node, color, size, style, children, ...props }: React.HTMLAttributes<HTMLElement> & { color?: string; size?: string; node?: HastNode }) {
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
}

function DivRenderer({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const classes = className?.split(/\s+/) ?? [];
  const admonType = (["warning", "error", "info", "tip"] as AdmonitionType[]).find(
    (t) => classes.includes(`md-alert-${t}`)
  );
  if (admonType) {
    return (
      <div className={`md-alert md-alert-${admonType}`} style={ADMONITION_STYLES[admonType]} {...props}>
        {children}
      </div>
    );
  }
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}

function createAnchorRenderer(
  openHoverPreview: OpenPreviewFn,
  closeHoverPreview: ClosePreviewFn,
) {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return function AnchorRenderer(props: any) {
    const { node, children, href, ...rest } = props;

    const wikilinkTitle = node?.properties?.dataWikilink;
    if (wikilinkTitle) {
      return (
        <WikilinkAnchor
          title={wikilinkTitle}
          onPreviewEnter={(event) => openHoverPreview(event, wikilinkTitle)}
          onPreviewLeave={closeHoverPreview}
        />
      );
    }

    if (href && typeof href === "string" && href.startsWith("/docs/")) {
      const childArray = React.Children.toArray(children);
      const textContent: string = childArray.length > 0 && typeof childArray[0] === "string"
        ? childArray[0]
        : "Link";
      return (
        <WikilinkAnchor
          title={textContent}
          idHref={href}
          onPreviewEnter={(event) => openHoverPreview(event, textContent, href)}
          onPreviewLeave={closeHoverPreview}
        />
      );
    }

    const isInternal = href && typeof href === "string" && href.startsWith("/");
    return (
      <a href={href} target={isInternal ? undefined : "_blank"} rel={isInternal ? undefined : "noopener noreferrer"} {...rest}>
        {children}
      </a>
    );
  };
}

export function buildMarkdownComponents(
  openHoverPreview: OpenPreviewFn,
  closeHoverPreview: ClosePreviewFn,
) {
  return {
    pre: PreRenderer,
    code: CodeRenderer,
    h1: HeadingRenderer(1),
    h2: HeadingRenderer(2),
    h3: HeadingRenderer(3),
    h4: HeadingRenderer(4),
    h5: HeadingRenderer(5),
    h6: HeadingRenderer(6),
    img: ImgRenderer,
    span: SpanRenderer,
    font: FontRenderer,
    div: DivRenderer,
    a: createAnchorRenderer(openHoverPreview, closeHoverPreview),
  };
}
