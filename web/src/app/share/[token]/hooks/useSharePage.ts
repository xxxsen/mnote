"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useSyncExternalStore,
} from "react";
import { useParams } from "next/navigation";
import { apiFetch, ApiError, getAuthToken } from "@/lib/api";
import type { PublicShareDetail } from "@/types";
import { useToast } from "@/components/ui/toast";
import { copyToClipboard } from "@/lib/clipboard";
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

const subscribeGuestAuthor = () => () => undefined;

function getGuestAuthorSnapshot() {
  if (getAuthToken()) return "";
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
  return `Guest #${anonID}`;
}

function useShareNotifier() {
  const { toast } = useToast();
  return useCallback((
    message: string,
    variant: "default" | "success" | "error" = "default",
  ) => toast({ description: message, variant }), [toast]);
}

function getShareIdentity(detail: PublicShareDetail | null) {
  const canAnnotate = detail?.permission === 2;
  return {
    doc: detail?.document,
    canAnnotate,
    permissionLabel: canAnnotate ? "Annotate" : "Read",
    permissionHint: canAnnotate ? "Can comment on this share" : "Read access only",
  };
}

export function useSharePage() {
  const params = useParams();
  const token = params.token as string;
  const notify = useShareNotifier();
  const [detail, setDetail] = useState<PublicShareDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sharePasswordInput, setSharePasswordInput] = useState("");
  const [accessPassword, setAccessPassword] = useState("");
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);
  const previewRef = useRef<HTMLDivElement>(null);
  const passwordRequestRef = useRef(false);
  const guestAuthor = useSyncExternalStore(
    subscribeGuestAuthor,
    getGuestAuthorSnapshot,
    () => "",
  );

  const { doc, canAnnotate, permissionLabel, permissionHint } = getShareIdentity(detail);

  const toc = useShareToc(previewRef, doc);
  const commentState = useShareComments({
    detail,
    token,
    accessPassword,
    canAnnotate,
    guestAuthor,
    notify,
  });

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
    const controller = new AbortController();
    const fetchDoc = async () => {
      setLoading(true);
      setError(false);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const fetchParams = new URLSearchParams();
          if (accessPassword.trim()) fetchParams.set("password", accessPassword.trim());
          const query = fetchParams.toString();
          const d = await apiFetch<PublicShareDetail>(
            `/public/share/${token}${query ? `?${query}` : ""}`,
            { requireAuth: false, signal: controller.signal },
          );
          if (controller.signal.aborted) return;
          setDetail(d);
          setPasswordRequired(false);
          setPasswordError("");
          return;
        } catch (fetchError) {
          if (controller.signal.aborted) return;
          if (fetchError instanceof ApiError && fetchError.code === 10000002) {
            setPasswordRequired(true);
            setPasswordError(accessPassword ? "Invalid password." : "");
            return;
          }
          if (fetchError instanceof ApiError && fetchError.code === 10000003) { setError(true); return; }
          if (
            fetchError instanceof Error
            && /too many requests/i.test(fetchError.message)
            && attempt < 2
          ) {
            await new Promise((resolve) => window.setTimeout(resolve, 1000 * (attempt + 1)));
            continue;
          }
          console.error(fetchError);
          setError(true);
          return;
        }
      }
    };
    void fetchDoc().finally(() => {
      if (!controller.signal.aborted) {
        passwordRequestRef.current = false;
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, [accessPassword, requestVersion, token]);

  useEffect(() => {
    const derivedTitle = doc
      ? extractDocTitle(doc.content) || doc.title || "Shared note"
      : "Shared note";
    document.title = `${derivedTitle} · Micro Note`;
  }, [doc]);

  const submitPassword = useCallback(() => {
    const password = sharePasswordInput.trim();
    if (!password) {
      setPasswordError("Enter the share password.");
      return;
    }
    if (passwordRequestRef.current) return;
    passwordRequestRef.current = true;
    setPasswordError("");
    setAccessPassword(password);
    setRequestVersion((value) => value + 1);
  }, [sharePasswordInput]);

  const retryShare = useCallback(() => {
    if (passwordRequestRef.current) return;
    passwordRequestRef.current = true;
    setRequestVersion((value) => value + 1);
  }, []);

  const handleCopyLink = useCallback(async () => {
    const copied = await copyToClipboard(window.location.href);
    notify(
      copied ? "Link copied to clipboard." : "Could not copy the link.",
      copied ? "success" : "error",
    );
  }, [notify]);

  const handleExport = () => {
    if (!doc || !detail) return;
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
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    const tryScroll = () => {
      if (cancelled) return;
      if (scrollToHash()) return;
      attempts += 1;
      if (attempts < 12) timerId = setTimeout(tryScroll, 100);
    };
    tryScroll();
    const onHashChange = () => { attempts = 0; tryScroll(); };
    window.addEventListener("hashchange", onHashChange);
    return () => {
      cancelled = true;
      if (timerId !== null) clearTimeout(timerId);
      window.removeEventListener("hashchange", onHashChange);
    };
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
    sharePasswordInput, setSharePasswordInput,
    accessPassword, passwordRequired, passwordError,
    submitPassword, retryShare,
    ...commentState,
    guestAuthor, notify, handleCopyLink, handleExport,
    slugify, getElementById, scrollToElement,
  };
}
