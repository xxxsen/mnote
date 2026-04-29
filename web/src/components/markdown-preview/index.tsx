"use client";

import { useMemo, forwardRef, memo, useEffect } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { cn } from "@/lib/utils";
import type { MarkdownPreviewProps } from "./types";
import type { HastNode } from "./types";
import {
  createSlugger,
  getHastText,
  extractHeadings,
  buildTocMarkdown,
  injectToc,
  convertWikilinks,
  escapeUnsupportedHtml,
  convertAdmonitions,
  breakLazyListContinuation,
} from "./helpers";
import { remarkSoftBreaks, rehypeCodeMeta } from "./plugins";
import { buildMarkdownComponents } from "./renderers";
import { useHoverPreview } from "./hooks/use-hover-preview";

// Re-export public API for backwards compatibility
export { toSafeInlineStyle, toFontSize, convertAdmonitions, escapeUnsupportedHtml, convertWikilinks, breakLazyListContinuation } from "./helpers";
export { ADMONITION_STYLES, FONT_SIZE_MAP } from "./constants";

const MarkdownPreview = memo(
  forwardRef<HTMLDivElement, MarkdownPreviewProps>(function MarkdownPreview(
    { content, className, showTocAside = false, tocClassName, onScroll, onTocLoaded, enableMentionHoverPreview = false },
    ref
  ) {
    const { hoverPreview, openHoverPreview, closeHoverPreview } = useHoverPreview(enableMentionHoverPreview);

    const { processedContent, tocMarkdown } = useMemo(() => {
      const headings = extractHeadings(content);
      const slugger = createSlugger();
      const headingsWithIds = headings.map((heading) => ({
        ...heading,
        id: slugger(heading.text),
      }));
      const toc = buildTocMarkdown(headingsWithIds);
      const updated = injectToc(content, toc);

      const mathFixed = updated
        .replace(/\\\((.*?)\\\)/g, '$$$1$$')
        .replace(/\\\[(.*?)\\\]/g, '$$$$$1$$$$');

      const wikilinkProcessed = convertWikilinks(mathFixed);
      const safeContent = escapeUnsupportedHtml(convertAdmonitions(wikilinkProcessed));
      const lazyFixed = breakLazyListContinuation(safeContent);
      return { processedContent: lazyFixed, tocMarkdown: toc };
    }, [content]);

    /* v8 ignore start -- rehype plugin tested indirectly via markdown output */
    const rehypeSlugger = useMemo(() => {
      /* eslint-disable no-param-reassign -- AST transformer mutates nodes by design */
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
      /* eslint-enable no-param-reassign */
    }, []);
    /* v8 ignore stop */

    useEffect(() => {
      onTocLoaded?.(tocMarkdown);
    }, [tocMarkdown, onTocLoaded]);

    const markdownComponents = useMemo(
      () => buildMarkdownComponents(openHoverPreview, closeHoverPreview),
      [closeHoverPreview, openHoverPreview]
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
        {enableMentionHoverPreview &&
          hoverPreview.open &&
          typeof document !== "undefined" &&
          createPortal(
            <div
              className="fixed z-[320] w-80 max-w-[calc(100vw-24px)] rounded-xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur-md pointer-events-none"
              style={{ left: hoverPreview.x, top: hoverPreview.y }}
            >
              <div className="text-[11px] font-semibold text-slate-900 truncate">{hoverPreview.title || "Untitled"}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-slate-600">
                {hoverPreview.loading ? "Loading preview..." : hoverPreview.content}
              </div>
            </div>,
            document.body
          )}
      </div>
    );
  })
);

export default MarkdownPreview;
