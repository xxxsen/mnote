"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { apiFetch } from "@/lib/api";
import MarkdownPreview from "@/components/markdown-preview";
import { Document } from "@/types";

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tocContent, setTocContent] = useState("");
  const [showFloatingToc, setShowFloatingToc] = useState(false);
  const [tocCollapsed, setTocCollapsed] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const hasTocToken = doc ? /\[(toc|TOC)]/.test(doc.content) : false;

  const extractTitleFromContent = useCallback((value: string) => {
    const lines = value.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const h1Match = line.match(/^#\s+(.+)$/);
      if (h1Match) return h1Match[1].trim();
      
      if (i + 1 < lines.length && /^=+$/.test(lines[i + 1].trim())) {
        return line;
      }
      
      return line.length > 50 ? line.slice(0, 50) + "..." : line;
    }
    return "";
  }, []);

  const slugify = useCallback((value: string) => {
    const base = value
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    return base || "section";
  }, []);


  const getElementById = useCallback((id: string) => {
    const container = previewRef.current;
    if (!container) return null;
    const safe = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/"/g, '\\"');
    return container.querySelector(`#${safe}`) as HTMLElement | null;
  }, []);

  const scrollToElement = useCallback((el: HTMLElement) => {
    const container = previewRef.current;
    if (!container) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const isScrollable = container.scrollHeight > container.clientHeight + 1;
    if (!isScrollable) {
      const top = window.scrollY + el.getBoundingClientRect().top - 16;
      window.scrollTo({ top, behavior: "smooth" });
      return;
    }
    const containerTop = container.getBoundingClientRect().top;
    const targetTop = el.getBoundingClientRect().top;
    const offset = targetTop - containerTop + container.scrollTop;
    container.scrollTo({ top: offset, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const fetchDoc = async () => {
      try {
        const d = await apiFetch<Document>(`/public/share/${token}`, { requireAuth: false });
        setDoc(d);
      } catch (err) {
        console.error(err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchDoc();
  }, [token]);

  useEffect(() => {
    if (!doc) return;
    const derivedTitle = extractTitleFromContent(doc.content) || doc.title || "MNOTE";
    if (typeof document !== "undefined") {
      document.title = derivedTitle;
    }
  }, [doc, extractTitleFromContent]);

  useEffect(() => {
    if (!doc) return;
    const scrollToHash = () => {
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      if (!hash) return false;
      const raw = decodeURIComponent(hash.slice(1));
      const normalized = raw.normalize("NFKC");
      const candidates = [raw, normalized, raw.toLowerCase(), slugify(raw), slugify(normalized)];
      for (const candidate of candidates) {
        const el = getElementById(candidate);
        if (el) {
          scrollToElement(el);
          return true;
        }
      }
      const headings = previewRef.current?.querySelectorAll("h1, h2, h3, h4, h5, h6") || [];
      for (const heading of headings) {
        const text = heading.textContent?.trim() || "";
        if (!text) continue;
        const headingSlug = slugify(text);
        if (candidates.includes(headingSlug) || candidates.includes(text)) {
          scrollToElement(heading as HTMLElement);
          return true;
        }
      }
      return false;
    };

    let attempts = 0;
    const tryScroll = () => {
      if (scrollToHash()) return;
      attempts += 1;
      if (attempts < 12) {
        window.setTimeout(tryScroll, 100);
      }
    };

    tryScroll();

    const onHashChange = () => {
      attempts = 0;
      tryScroll();
    };

    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [doc, slugify, getElementById, scrollToElement]);

  useEffect(() => {
    const hasToken = doc ? /\[(toc|TOC)]/.test(doc.content) : false;
    if (!tocContent || !hasToken) {
      setShowFloatingToc(false);
      return;
    }

    const container = previewRef.current;
    if (!container) return;

    let timer: number | null = null;
    let ticking = false;

    const updateVisibility = () => {
      ticking = false;
      const tocEl = container.querySelector(".toc-wrapper") as HTMLElement | null;
      if (!tocEl) {
        setShowFloatingToc(false);
        return;
      }
      const isScrollable = container.scrollHeight > container.clientHeight + 1;
      if (isScrollable) {
        const top = tocEl.offsetTop;
        const bottom = top + tocEl.offsetHeight;
        const viewTop = container.scrollTop;
        const viewBottom = viewTop + container.clientHeight;
        const inView = bottom > viewTop && top < viewBottom;
        setShowFloatingToc(!inView);
        return;
      }
      const rect = tocEl.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const inView = rect.bottom > 0 && rect.top < viewportHeight;
      setShowFloatingToc(!inView);
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updateVisibility);
    };

    const scrollTarget = container.scrollHeight > container.clientHeight + 1 ? container : window;
    timer = window.setTimeout(updateVisibility, 120);
    scrollTarget.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      scrollTarget.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (timer) window.clearTimeout(timer);
    };
  }, [tocContent, doc]);

  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  if (error || !doc) return <div className="flex h-screen items-center justify-center text-destructive">Document not found or link expired</div>;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center p-4 md:p-8">
      <div className="w-full max-w-4xl border border-border bg-card shadow-sm min-h-[80vh] flex flex-col">
        <div className="flex-1 p-0">
          <MarkdownPreview
            ref={previewRef}
            content={doc.content}
            className="h-full min-h-[500px] p-6"
            onTocLoaded={(toc) => setTocContent(hasTocToken ? toc : "")}
          />
        </div>
        <footer className="border-t border-border p-4 text-center text-xs text-muted-foreground font-mono bg-muted/30">
          Published with Micro Note
        </footer>
      </div>

      {showFloatingToc && tocContent && (
        <div className="fixed top-24 right-8 z-50 hidden w-64 rounded-xl border border-border bg-card/95 shadow-xl backdrop-blur-sm lg:block animate-in fade-in slide-in-from-right-4 duration-300">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
            <div className="text-xs font-mono text-muted-foreground">目录</div>
            <button
              onClick={() => setTocCollapsed(!tocCollapsed)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {tocCollapsed ? "展开" : "收起"}
            </button>
          </div>
          {!tocCollapsed && (
            <div className="toc-wrapper text-sm max-h-[60vh] overflow-y-auto p-3">
              <ReactMarkdown
                components={{
                  a: (props) => {
                  const href = props.href || "";
                  return (
                    <a
                      {...props}
                      onClick={(event) => {
                        props.onClick?.(event);
                        if (!href.startsWith("#")) return;
                        event.preventDefault();
                        const rawHash = decodeURIComponent(href.slice(1));
                        const normalizedHash = rawHash.normalize("NFKC");
                        const targetCandidates = [rawHash, normalizedHash, slugify(rawHash), slugify(normalizedHash)];
                        for (const candidate of targetCandidates) {
                          const el = getElementById(candidate);
                          if (el) {
                            scrollToElement(el);
                            break;
                          }
                        }
                      }}
                    />
                  );
                },
              }}
              >
                {tocContent}
              </ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
