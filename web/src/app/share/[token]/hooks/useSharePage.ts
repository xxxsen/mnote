"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiFetch, ApiError, getAuthToken } from "@/lib/api";
import { PublicShareDetail, ShareComment, ShareCommentsPage } from "@/types";
import { GUEST_ANON_ID_KEY, generateGuestAnonID } from "../utils";

export function useSharePage() {
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
  const [comments, setComments] = useState<ShareComment[]>([]);
  const [commentsTotal, setCommentsTotal] = useState(0);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [annotationContent, setAnnotationContent] = useState("");
  const [annotationSubmitting, setAnnotationSubmitting] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: string; author: string } | null>(null);
  const [inlineReplyContent, setInlineReplyContent] = useState("");
  const [commentsHasMore, setCommentsHasMore] = useState(true);
  const [commentsAppending, setCommentsAppending] = useState(false);
  const [loadedCommentsCount, setLoadedCommentsCount] = useState(0);
  const [guestAuthor, setGuestAuthor] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);
  const doc = detail?.document;
  const hasTocToken = doc ? /\[(toc|TOC)]/.test(doc.content) : false;
  const canAnnotate = detail?.permission === 2;
  const permissionLabel = canAnnotate ? "Annotate" : "Read";
  const permissionHint = canAnnotate ? "Can comment on this share" : "Read access only";

  const showToast = useCallback((message: string, durationMs = 2500) => {
    setToast(message);
    window.setTimeout(() => setToast(null), durationMs);
  }, []);

  useEffect(() => {
    const authToken = getAuthToken();
    if (authToken) {
      setGuestAuthor("");
      return;
    }
    let anonID = "";
    try {
      anonID = localStorage.getItem(GUEST_ANON_ID_KEY) || "";
      if (!/^[A-Z0-9]{4}$/.test(anonID)) {
        anonID = generateGuestAnonID();
        localStorage.setItem(GUEST_ANON_ID_KEY, anonID);
      }
    } catch {
      anonID = generateGuestAnonID();
    }
    setGuestAuthor(`Guest #${anonID}`);
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
      const top = window.scrollY + el.getBoundingClientRect().top - 80;
      window.scrollTo({ top, behavior: "smooth" });
      return;
    }
    const containerTop = container.getBoundingClientRect().top;
    const targetTop = el.getBoundingClientRect().top;
    const offset = targetTop - containerTop + container.scrollTop - 80;
    container.scrollTo({ top: offset, behavior: "smooth" });
  }, []);

  // Scroll progress tracking
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

  const mergeCommentsByID = useCallback((base: ShareComment[], incoming: ShareComment[]) => {
    if (!incoming.length) return base;
    const seen = new Set(base.map((item) => item.id));
    const merged = [...base];
    for (const item of incoming) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
    return merged;
  }, []);

  const fetchComments = useCallback(async (isBackground = false, isAppend = false) => {
    if (!detail) {
      if (!isAppend) {
        setComments([]);
        setCommentsTotal(0);
        setLoadedCommentsCount(0);
      }
      return;
    }
    if (isAppend) {
      if (commentsAppending) return;
      setCommentsAppending(true);
    } else if (!isBackground) {
      setCommentsLoading(true);
    }
    try {
      const qs = new URLSearchParams();
      if (accessPassword.trim()) {
        qs.set("password", accessPassword.trim());
      }
      qs.set("limit", "10");
      qs.set("offset", isAppend ? loadedCommentsCount.toString() : "0");

      const query = qs.toString();
      const page = await apiFetch<ShareCommentsPage>(`/public/share/${token}/comments${query ? `?${query}` : ""}`, { requireAuth: false });
      const items = page?.items || [];
      const total = typeof page?.total === "number" ? page.total : items.length;

      if (isAppend) {
        setComments(prev => mergeCommentsByID(prev, items || []));
        const nextLoaded = loadedCommentsCount + items.length;
        setLoadedCommentsCount(nextLoaded);
        setCommentsHasMore(nextLoaded < total);
      } else {
        setComments(items || []);
        setLoadedCommentsCount(items.length);
        setCommentsHasMore(items.length < total);
      }
      setCommentsTotal(total);
    } catch (err) {
      console.error(err);
      if (!isAppend) {
        setComments([]);
        setCommentsTotal(0);
      }
    } finally {
      if (isAppend) {
        setCommentsAppending(false);
      } else if (!isBackground) {
        setCommentsLoading(false);
      }
    }
  }, [accessPassword, detail, token, loadedCommentsCount, commentsAppending, mergeCommentsByID]);

  useEffect(() => {
    void fetchComments(false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, accessPassword, token]);

  const handleLoadMoreComments = useCallback(() => {
    if (!commentsLoading && !commentsAppending && commentsHasMore) {
      void fetchComments(true, true);
    }
  }, [commentsLoading, commentsAppending, commentsHasMore, fetchComments]);

  useEffect(() => {
    const handleBottomScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
        if (!commentsLoading && !commentsAppending && commentsHasMore && comments.length > 0) {
          handleLoadMoreComments();
        }
      }
    };
    window.addEventListener("scroll", handleBottomScroll);
    return () => window.removeEventListener("scroll", handleBottomScroll);
  }, [commentsLoading, commentsAppending, commentsHasMore, comments.length, handleLoadMoreComments]);

  const handleSubmitComment = async () => {
    if (!detail || !canAnnotate || annotationSubmitting) return;
    const content = annotationContent.trim();
    if (!content) {
      showToast("Please enter comment content.");
      return;
    }
    setAnnotationSubmitting(true);
    try {
      const created = await apiFetch<ShareComment>(`/public/share/${token}/comments`, {
        method: "POST",
        requireAuth: false,
        body: JSON.stringify({
          password: accessPassword.trim() || undefined,
          author: guestAuthor || undefined,
          content,
        }),
      });
      setComments((prev) => [created, ...prev]);
      setCommentsTotal((prev) => prev + 1);
      setLoadedCommentsCount((prev) => prev + 1);
      setAnnotationContent("");
      showToast("Comment added.");
      void fetchComments(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add comment";
      showToast(msg, 3000);
    } finally {
      setAnnotationSubmitting(false);
    }
  };

  // Fetch document
  useEffect(() => {
    const fetchDoc = async () => {
      try {
        const fetchParams = new URLSearchParams();
        if (accessPassword.trim()) {
          fetchParams.set("password", accessPassword.trim());
        }
        const query = fetchParams.toString();
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

  // Set document title
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

  // Hash navigation
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

  // Floating TOC visibility
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

  return {
    token,
    detail,
    doc,
    loading,
    error,
    previewRef,
    hasTocToken,
    canAnnotate,
    permissionLabel,
    permissionHint,
    tocContent,
    showFloatingToc,
    tocCollapsed,
    setTocCollapsed,
    showMobileToc,
    setShowMobileToc,
    handleTocLoaded,
    scrollProgress,
    showScrollTop,
    toast,
    showToast,
    sharePasswordInput,
    setSharePasswordInput,
    accessPassword,
    setAccessPassword,
    passwordRequired,
    passwordError,
    setLoading,
    comments,
    commentsTotal,
    commentsLoading,
    annotationContent,
    setAnnotationContent,
    annotationSubmitting,
    replyingTo,
    setReplyingTo,
    inlineReplyContent,
    setInlineReplyContent,
    commentsHasMore,
    handleSubmitComment,
    handleLoadMoreComments,
    guestAuthor,
    handleCopyLink,
    handleExport,
    slugify,
    getElementById,
    scrollToElement,
  };
}
