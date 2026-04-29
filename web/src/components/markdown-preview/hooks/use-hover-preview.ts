"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type React from "react";
import { apiFetch } from "@/lib/api";

export type HoverPreviewState = {
  open: boolean;
  x: number;
  y: number;
  loading: boolean;
  title: string;
  content: string;
};

const INITIAL_STATE: HoverPreviewState = {
  open: false, x: 0, y: 0, loading: false, title: "", content: "",
};

export async function resolveTargetId(linkTitle: string, linkHref?: string): Promise<string> {
  if (linkHref?.startsWith("/docs/")) {
    const id = linkHref.replace(/^\/docs\//, "").split(/[?#]/)[0] || "";
    if (id) return id;
  }
  if (!linkTitle) return "";
  const docs = await apiFetch<{ id: string; title: string }[]>(
    `/documents?q=${encodeURIComponent(linkTitle)}&limit=5`
  );
  const exact = docs.find((doc) => doc.title === linkTitle);
  return exact?.id || docs[0]?.id || "";
}

export async function fetchPreviewSnippet(targetID: string, linkTitle: string) {
  const detail = await apiFetch<{ document: { title: string; content: string; summary?: string } }>(`/documents/${targetID}`);
  const summary = (detail.document.summary || "").trim();
  const source = summary || detail.document.content || "";
  const normalized = source.replace(/[#>*_`[\]\-]/g, " ").replace(/\s+/g, " ").trim();
  const snippet = normalized.length > 180 ? `${normalized.slice(0, 180)}...` : normalized;
  return {
    title: detail.document.title || linkTitle || "Untitled",
    content: snippet || "Empty note",
  };
}

/* v8 ignore start -- viewport-based position clamping requires real window dimensions */
function computePopoverPosition(rect: DOMRect) {
  return {
    top: Math.min(window.innerHeight - 220, Math.max(12, rect.bottom + 8)),
    left: Math.min(window.innerWidth - 360, Math.max(12, rect.left)),
  };
}
/* v8 ignore stop */

export function useHoverPreview(enabled: boolean) {
  const hoverTimerRef = useRef<number | null>(null);
  const hoverRequestRef = useRef(0);
  const previewCacheRef = useRef<Partial<Record<string, { title: string; content: string }>>>({});
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewState>(INITIAL_STATE);

  const closeHoverPreview = useCallback(() => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverPreview((prev) => ({ ...prev, open: false, loading: false }));
  }, []);

  const openHoverPreview = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, linkTitle: string, linkHref?: string) => {
      if (!enabled) return;
      const pos = computePopoverPosition(event.currentTarget.getBoundingClientRect());
      const cacheKey = linkHref ? `id:${linkHref}` : `title:${linkTitle}`;
      const cached = previewCacheRef.current[cacheKey];
      if (hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      if (cached) {
        setHoverPreview({
          open: true, x: pos.left, y: pos.top, loading: false,
          title: cached.title, content: cached.content,
        });
        return;
      }
      setHoverPreview({
        open: true, x: pos.left, y: pos.top, loading: true,
        title: linkTitle || "Loading...", content: "",
      });
      /* v8 ignore start -- timer-based async chain with requestID guards is hard to test deterministically */
      hoverTimerRef.current = window.setTimeout(() => {
        const requestID = hoverRequestRef.current + 1;
        hoverRequestRef.current = requestID;
        void (async () => {
          try {
            const targetID = await resolveTargetId(linkTitle, linkHref);
            if (!targetID) {
              if (hoverRequestRef.current === requestID) {
                setHoverPreview((prev) => ({ ...prev, loading: false, content: "No preview available" }));
              }
              return;
            }
            const next = await fetchPreviewSnippet(targetID, linkTitle);
            previewCacheRef.current[cacheKey] = next;
            if (hoverRequestRef.current === requestID) {
              setHoverPreview({ open: true, x: pos.left, y: pos.top, loading: false, title: next.title, content: next.content });
            }
          } catch {
            if (hoverRequestRef.current === requestID) {
              setHoverPreview((prev) => ({ ...prev, loading: false, content: "Failed to load preview" }));
            }
          }
        })();
      }, 140);
      /* v8 ignore stop */
    },
    [enabled]
  );

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  return { hoverPreview, openHoverPreview, closeHoverPreview };
}
