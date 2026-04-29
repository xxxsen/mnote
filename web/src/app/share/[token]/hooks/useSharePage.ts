"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { apiFetch, ApiError, getAuthToken } from "@/lib/api";
import type { PublicShareDetail } from "@/types";
import { GUEST_ANON_ID_KEY, generateGuestAnonID } from "../utils";
import { useShareComments } from "./useShareComments";
import { useShareToc } from "./useShareToc";

function extractDocTitle(value: string) {
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
}

export function useSharePage() {
  const params = useParams();
  const token = params.token as string;
  const [detail, setDetail] = useState<PublicShareDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [sharePasswordInput, setSharePasswordInput] = useState("");
  const [accessPassword, setAccessPassword] = useState("");
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [guestAuthor, setGuestAuthor] = useState("");
  const previewRef = useRef<HTMLDivElement>(null);

  const doc = detail?.document;
  const canAnnotate = detail?.permission === 2;
  const permissionLabel = canAnnotate ? "Annotate" : "Read";
  const permissionHint = canAnnotate ? "Can comment on this share" : "Read access only";

  const showToast = useCallback((message: string, durationMs = 2500) => {
    setToast(message);
    window.setTimeout(() => setToast(null), durationMs);
  }, []);

  const toc = useShareToc(previewRef, doc);
  const commentState = useShareComments({ detail, token, accessPassword, canAnnotate, guestAuthor, showToast });

  useEffect(() => {
    const authToken = getAuthToken();
    if (authToken) { setGuestAuthor(""); return; }
    let anonID = "";
    try {
      anonID = localStorage.getItem(GUEST_ANON_ID_KEY) || "";
      if (!/^[A-Z0-9]{4}$/.test(anonID)) { anonID = generateGuestAnonID(); localStorage.setItem(GUEST_ANON_ID_KEY, anonID); }
    } catch { anonID = generateGuestAnonID(); }
    setGuestAuthor(`Guest #${anonID}`);
  }, []);

  const slugify = useCallback((value: string) => {
    const base = value.toLowerCase().trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
    return base || "section";
  }, []);

  const getElementById = useCallback((id: string) => {
    const container = previewRef.current;
    if (!container) return null;
    return container.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
  }, []);

  /* v8 ignore start -- scroll position logic requires real browser viewport */
  const scrollToElement = useCallback((el: HTMLElement) => {
    const container = previewRef.current;
    if (!container) { el.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    const isScrollable = container.scrollHeight > container.clientHeight + 1;
    if (!isScrollable) {
      window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 80, behavior: "smooth" });
      return;
    }
    const offset = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 80;
    container.scrollTo({ top: offset, behavior: "smooth" });
  }, []);
  /* v8 ignore stop */

  useEffect(() => {
    const fetchDoc = async () => {
      try {
        const fetchParams = new URLSearchParams();
        if (accessPassword.trim()) fetchParams.set("password", accessPassword.trim());
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
      } finally { setLoading(false); }
    };
    void fetchDoc();
  }, [accessPassword, token]);

  useEffect(() => {
    if (!doc) return;
    const derivedTitle = extractDocTitle(doc.content) || doc.title || "MNOTE";
    document.title = derivedTitle;
  }, [doc]);

  /* v8 ignore start -- clipboard interaction requires secure context */
  const handleCopyLink = () => {
    const value = window.location.href;
    const fallbackCopy = () => {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        return ok;
      } catch { return false; }
    };
    try {
      void navigator.clipboard.writeText(value)
        .then(() => { setToast("Link copied to clipboard!"); })
        .catch(() => {
          setToast(fallbackCopy() ? "Link copied to clipboard!" : "Failed to copy link");
        })
        .finally(() => { setTimeout(() => setToast(null), 3000); });
    } catch {
      setToast(fallbackCopy() ? "Link copied to clipboard!" : "Failed to copy link");
      setTimeout(() => setToast(null), 3000);
    }
  };
  /* v8 ignore stop */

  const handleExport = () => {
    if (!doc) return;
    if (detail.allow_download === 0) return;
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

  /* v8 ignore start -- hash-based scroll requires real browser viewport */
  useEffect(() => {
    if (!doc) return;
    const scrollToHash = () => {
      const hash = window.location.hash;
      if (!hash) return false;
      const raw = decodeURIComponent(hash.slice(1));
      const normalized = raw.normalize("NFKC");
      const candidates = [raw, normalized, raw.toLowerCase(), slugify(raw), slugify(normalized)];
      for (const candidate of candidates) {
        const el = getElementById(candidate);
        if (el) { scrollToElement(el); return true; }
      }
      const headings = previewRef.current?.querySelectorAll("h1, h2, h3, h4, h5, h6") ?? [];
      for (const heading of headings) {
        const text = (heading.textContent || "").trim();
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
    const tryScroll = () => { if (scrollToHash()) return; attempts += 1; if (attempts < 12) window.setTimeout(tryScroll, 100); };
    tryScroll();
    const onHashChange = () => { attempts = 0; tryScroll(); };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [doc, slugify, getElementById, scrollToElement]);
  /* v8 ignore stop */

  return {
    token, detail, doc, loading, error, previewRef,
    hasTocToken: toc.hasTocToken, canAnnotate, permissionLabel, permissionHint,
    tocContent: toc.tocContent, showFloatingToc: toc.showFloatingToc,
    tocCollapsed: toc.tocCollapsed, setTocCollapsed: toc.setTocCollapsed,
    showMobileToc: toc.showMobileToc, setShowMobileToc: toc.setShowMobileToc,
    handleTocLoaded: toc.handleTocLoaded,
    scrollProgress: toc.scrollProgress, showScrollTop: toc.showScrollTop,
    toast, showToast,
    sharePasswordInput, setSharePasswordInput,
    accessPassword, setAccessPassword,
    passwordRequired, passwordError, setLoading,
    ...commentState,
    guestAuthor, handleCopyLink, handleExport,
    slugify, getElementById, scrollToElement,
  };
}
