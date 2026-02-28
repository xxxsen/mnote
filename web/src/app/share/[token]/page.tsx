"use client";

import { useEffect, useState, useCallback, useRef, memo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { apiFetch, ApiError } from "@/lib/api";
import MarkdownPreview from "@/components/markdown-preview";
import { PublicShareDetail } from "@/types";
import { formatDate, generatePixelAvatar } from "@/lib/utils";
import { Clock, User, Tag as TagIcon, ArrowUp, Link2, Download, Menu, X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SharedContentProps {
  previewRef: React.RefObject<HTMLDivElement | null>;
  content: string;
  handleTocLoaded: (toc: string) => void;
}

const SharedContent = memo(({ previewRef, content, handleTocLoaded }: SharedContentProps) => (
  <article className="w-full bg-white rounded-2xl shadow-[0_10px_40px_-15px_rgba(0,0,0,0.1)] border border-slate-200/50 relative overflow-visible">
    <div className="p-6 md:p-12 lg:p-16">
      <MarkdownPreview
        ref={previewRef}
        content={content}
        className="prose prose-slate max-w-none prose-headings:scroll-mt-24 prose-img:rounded-xl text-slate-800"
        onTocLoaded={handleTocLoaded}
      />
    </div>
  </article>
));

SharedContent.displayName = "SharedContent";

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;
  const [detail, setDetail] = useState<PublicShareDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tocContent, setTocContent] = useState("");
  const [showFloatingToc, setShowFloatingToc] = useState(false);
  const [tocCollapsed, setTocCollapsed] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showMobileToc, setShowMobileToc] = useState(false);
  const [sharePasswordInput, setSharePasswordInput] = useState("");
  const [accessPassword, setAccessPassword] = useState("");
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  
  const previewRef = useRef<HTMLDivElement>(null);
  const doc = detail?.document;
  const hasTocToken = doc ? /\[(toc|TOC)]/.test(doc.content) : false;

  const estimateReadingTime = (content: string) => {
    const wordsPerMinute = 200;
    const wordCount = content.trim().split(/\s+/).length;
    return Math.ceil(wordCount / wordsPerMinute);
  };

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
      const top = window.scrollY + el.getBoundingClientRect().top - 80;
      window.scrollTo({ top, behavior: "smooth" });
      return;
    }
    const containerTop = container.getBoundingClientRect().top;
    const targetTop = el.getBoundingClientRect().top;
    const offset = targetTop - containerTop + container.scrollTop - 80;
    container.scrollTo({ top: offset, behavior: "smooth" });
  }, []);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
          if (totalHeight > 0) {
            setScrollProgress((window.scrollY / totalHeight) * 100);
          }
          setShowScrollTop(window.scrollY > 400);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const fetchDoc = async () => {
      try {
        const params = new URLSearchParams();
        if (accessPassword.trim()) {
          params.set("password", accessPassword.trim());
        }
        const query = params.toString();
        const d = await apiFetch<PublicShareDetail>(`/public/share/${token}${query ? `?${query}` : ""}`, { requireAuth: false });
        setDetail(d);
        setPasswordRequired(false);
        setPasswordError("");
      } catch (err) {
        if (err instanceof ApiError && err.code === 10000002) {
          setPasswordRequired(true);
          setPasswordError(accessPassword ? "Invalid password." : "");
        } else {
          console.error(err);
          setError(true);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchDoc();
  }, [accessPassword, token]);

  useEffect(() => {
    if (!doc) return;
    const extractTitle = (value: string) => {
       const lines = value.split("\n");
       for (let i = 0; i < lines.length; i++) {
         const line = lines[i].trim();
         if (!line) continue;
         const h1Match = line.match(/^#\s+(.+)$/);
         if (h1Match) return h1Match[1].trim();
         if (i + 1 < lines.length && /^=+$/.test(lines[i + 1].trim())) return line;
         return line.length > 50 ? line.slice(0, 50) + "..." : line;
       }
       return "";
    };
    const derivedTitle = extractTitle(doc.content) || doc.title || "MNOTE";
    if (typeof document !== "undefined") {
      document.title = derivedTitle;
    }
  }, [doc]);

  const handleCopyLink = () => {
    const value = window.location.href;

    const fallbackCopy = () => {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    };

    const copyPromise =
      typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function"
        ? navigator.clipboard.writeText(value).then(() => true).catch(() => fallbackCopy())
        : Promise.resolve(fallbackCopy());

    void copyPromise.then((ok) => {
      if (ok) {
        setToast("Link copied to clipboard!");
      } else {
        setToast("Failed to copy link");
      }
      setTimeout(() => setToast(null), 3000);
    });
  };

  const handleExport = () => {
    if (!doc || detail?.allow_download === 0) return;
    const blob = new Blob([doc.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.title || "untitled"}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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

  const handleTocLoaded = useCallback((toc: string) => {
    setTocContent(hasTocToken ? toc : "");
  }, [hasTocToken]);

  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  if (passwordRequired) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm bg-white border border-slate-200/70 rounded-2xl shadow-xl p-6 space-y-4">
          <h1 className="text-lg font-bold text-slate-900">Protected Share</h1>
          <p className="text-sm text-slate-500">This note is password protected.</p>
          <input
            type="password"
            value={sharePasswordInput}
            onChange={(e) => setSharePasswordInput(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm"
            placeholder="Enter password"
          />
          {passwordError && <div className="text-xs text-red-500">{passwordError}</div>}
          <Button
            className="w-full"
            onClick={() => {
              setLoading(true);
              setAccessPassword(sharePasswordInput.trim());
            }}
          >
            Continue
          </Button>
        </div>
      </div>
    );
  }
  if (error || !doc || !detail) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-md bg-white border border-slate-200/70 rounded-2xl shadow-xl p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xl font-bold">
            M
          </div>
          <div className="mt-4 text-xs font-mono text-slate-500 uppercase tracking-widest">Micro Note</div>
          <h1 className="mt-3 text-xl font-bold text-slate-900">Share link unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">
            This note may have been deleted, moved, or the link has expired.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link href="/">
              <Button className="rounded-full px-5">Go Home</Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" className="rounded-full px-5">Sign In</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const readingTime = estimateReadingTime(doc.content);

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center selection:bg-indigo-100">
      <div className="fixed top-0 left-0 w-full h-1 z-50 bg-transparent">
        <div 
          className="h-full bg-indigo-500 transition-all duration-150 ease-out"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      <div className="fixed bottom-8 right-8 flex flex-col gap-3 z-40">
        {showScrollTop && (
          <Button
            size="icon"
            variant="outline"
            className="rounded-full shadow-lg bg-background/80 backdrop-blur-sm border-border hover:bg-background"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        )}
        <Button
          size="icon"
          variant="outline"
          className="rounded-full shadow-lg bg-background/80 backdrop-blur-sm border-border hover:bg-background xl:hidden"
          onClick={() => setShowMobileToc(true)}
          title="Table of Contents"
        >
          <Menu className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="rounded-full shadow-lg bg-background/80 backdrop-blur-sm border-border hover:bg-background"
          onClick={handleCopyLink}
          title="Copy Link"
        >
          <Link2 className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          className="rounded-full shadow-lg bg-background/80 backdrop-blur-sm border-border hover:bg-background"
          onClick={handleExport}
          title={detail?.allow_download === 0 ? "Download disabled by owner" : "Export Markdown"}
          disabled={detail?.allow_download === 0}
        >
          <Download className="h-4 w-4" />
        </Button>
      </div>

      <div className="w-full max-w-4xl px-4 md:px-0 py-12 md:py-20 flex flex-col items-center">
        {/* Article Header */}
        <header className="w-full mb-3 flex flex-col px-4 md:px-0">
          <div className="flex items-center gap-2 text-indigo-600 font-mono text-xs mb-4 font-bold uppercase tracking-wider">
            <span>Public Note</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-muted-foreground">{doc.id.slice(0, 8)}</span>
          </div>
          
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-slate-900 mb-8 leading-tight">
            {doc.title}
          </h1>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 text-sm text-slate-500 border-y border-slate-200/60 py-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border border-slate-200 overflow-hidden shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={generatePixelAvatar(detail.author)} 
                  alt="Author" 
                  className="w-full h-full object-cover"
                  style={{ imageRendering: "pixelated" }} 
                />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-slate-900 font-bold leading-normal mb-0.5 truncate whitespace-nowrap">{detail.author}</span>
                <span className="text-[10px] text-slate-400 font-mono uppercase tracking-tight leading-normal">Verified Creator</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 md:justify-end">
              <div className="flex items-center gap-2 whitespace-nowrap">
                <Clock className="h-4 w-4 opacity-70" />
                <span>{formatDate(doc.mtime)}</span>
              </div>

              <div className="flex items-center gap-2 whitespace-nowrap">
                <User className="h-4 w-4 opacity-70" />
                <span>{readingTime} min read</span>
              </div>
              <div className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                {detail.permission === 2 ? "Comment enabled" : "View only"}
              </div>
              {detail.expires_at > 0 && (
                <div className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                  Expires {formatDate(detail.expires_at)}
                </div>
              )}
            </div>
          </div>

          {detail.tags && detail.tags.length > 0 && (
            <div className="mt-3 flex h-8 items-center gap-2">
              <TagIcon className="h-4 w-4 opacity-70 shrink-0" />
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {detail.tags.map(tag => (
                  <span 
                    key={tag.id}
                    className="inline-flex h-6 items-center px-2.5 rounded-full text-xs leading-none font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap"
                  >
                    #{tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </header>

        {doc.summary && (
          <div className="w-full mb-8 rounded-2xl border border-slate-200/70 bg-white/70 p-6 shadow-[0_6px_20px_-12px_rgba(15,23,42,0.25)]">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">AI Summary</div>
            <p className="mt-3 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
              {doc.summary}
            </p>
          </div>
        )}

        {/* Content Container */}
        <SharedContent 
          previewRef={previewRef}
          content={doc.content}
          handleTocLoaded={handleTocLoaded}
        />

        <footer className="w-full mt-16 pt-12 border-t border-slate-200 flex flex-col items-center gap-6 px-4">
           <Link href="/" className="flex items-center gap-3 grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all cursor-pointer">
              <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white font-bold text-xl shadow-lg">M</div>
              <div className="flex flex-col">
                <span className="font-bold text-slate-900 leading-none">Micro Note</span>
                <span className="text-[10px] text-slate-500 font-mono tracking-wider">PERSONAL KNOWLEDGE BASE</span>
              </div>
           </Link>
           
           <p className="text-slate-400 text-xs font-medium tracking-wide uppercase">
             Published with Micro Note &bull; {new Date().getFullYear()}
           </p>

           <Link href="/">
             <Button 
               variant="outline" 
               className="rounded-full px-6 border-slate-200 hover:bg-slate-50 transition-colors"
             >
               Create your own note
             </Button>
           </Link>
        </footer>
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="bg-slate-900 text-white px-4 py-2 rounded-full text-sm font-medium shadow-2xl flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            {toast}
          </div>
        </div>
      )}

      {showFloatingToc && tocContent && (
        <div className="fixed top-24 right-8 z-30 hidden w-72 rounded-2xl border border-slate-200/60 bg-white/80 shadow-2xl backdrop-blur-md xl:block animate-in fade-in slide-in-from-right-4 duration-500">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/60">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">On this page</div>
            <button
              onClick={() => setTocCollapsed(!tocCollapsed)}
              className="p-1 rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-all"
            >
              {tocCollapsed ? <Menu className="h-3 w-3" /> : <X className="h-3 w-3" />}
            </button>
          </div>
          {!tocCollapsed && (
            <div className="toc-wrapper text-sm max-h-[60vh] overflow-y-auto p-4 custom-scrollbar">
              <ReactMarkdown
                components={{
                  a: (props) => {
                  const href = props.href || "";
                  return (
                    <a
                      {...props}
                      className="text-slate-500 hover:text-indigo-600 transition-colors py-1 block no-underline"
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
      {showMobileToc && (
        <div className="fixed inset-0 z-50 flex justify-end xl:hidden">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowMobileToc(false)} />
          <div className="relative w-80 bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <span className="font-bold text-slate-900">Contents</span>
              <Button size="icon" variant="ghost" onClick={() => setShowMobileToc(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
              <ReactMarkdown
                components={{
                  a: (props) => (
                    <a
                      {...props}
                      className="text-slate-600 hover:text-indigo-600 transition-colors py-2 block border-b border-slate-50 last:border-0"
                      onClick={(event) => {
                        if (!props.href?.startsWith("#")) return;
                        event.preventDefault();
                        const id = decodeURIComponent(props.href.slice(1));
                        const el = getElementById(id) || getElementById(slugify(id));
                        if (el) {
                          scrollToElement(el);
                          setShowMobileToc(false);
                        }
                      }}
                    />
                  ),
                }}
              >
                {tocContent}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
