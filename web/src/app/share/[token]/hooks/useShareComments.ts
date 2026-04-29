"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import type { ShareComment, ShareCommentsPage } from "@/types";

function mergeCommentsByID(base: ShareComment[], incoming: ShareComment[]) {
  if (!incoming.length) return base;
  const seen = new Set(base.map((item) => item.id));
  const merged = [...base];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

export interface UseShareCommentsOptions {
  detail: { permission?: number } | null;
  token: string;
  accessPassword: string;
  canAnnotate: boolean;
  guestAuthor: string;
  showToast: (msg: string, dur?: number) => void;
}

interface FetchResultContext {
  setComments: React.Dispatch<React.SetStateAction<ShareComment[]>>;
  setLoadedCommentsCount: React.Dispatch<React.SetStateAction<number>>;
  setCommentsHasMore: React.Dispatch<React.SetStateAction<boolean>>;
  setCommentsTotal: React.Dispatch<React.SetStateAction<number>>;
}

function applyFetchResult(
  items: ShareComment[], total: number, isAppend: boolean, loadedCount: number, ctx: FetchResultContext,
) {
  if (isAppend) {
    ctx.setComments(prev => mergeCommentsByID(prev, items));
    const nextLoaded = loadedCount + items.length;
    ctx.setLoadedCommentsCount(nextLoaded);
    ctx.setCommentsHasMore(nextLoaded < total);
  } else {
    ctx.setComments(items);
    ctx.setLoadedCommentsCount(items.length);
    ctx.setCommentsHasMore(items.length < total);
  }
  ctx.setCommentsTotal(total);
}

export function useShareComments(opts: UseShareCommentsOptions) {
  const { detail, token, accessPassword, canAnnotate, guestAuthor, showToast } = opts;
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

  const fetchComments = useCallback(async (isBackground: boolean, isAppend: boolean) => {
    if (!detail) {
      if (!isAppend) { setComments([]); setCommentsTotal(0); setLoadedCommentsCount(0); } /* v8 ignore -- append with null detail is unreachable */
      return;
    }
    if (isAppend) {
      /* v8 ignore next */ if (commentsAppending) return;
      setCommentsAppending(true);
    } else if (!isBackground) {
      setCommentsLoading(true);
    }
    try {
      const qs = new URLSearchParams();
      if (accessPassword.trim()) qs.set("password", accessPassword.trim());
      qs.set("limit", "10");
      qs.set("offset", isAppend ? loadedCommentsCount.toString() : "0");
      const query = qs.toString();
      const page = await apiFetch<ShareCommentsPage>(`/public/share/${token}/comments${query ? `?${query}` : ""}`, { requireAuth: false });
      const items = page.items;
      const total = typeof page.total === "number" ? page.total : items.length;
      applyFetchResult(items, total, isAppend, loadedCommentsCount, { setComments, setLoadedCommentsCount, setCommentsHasMore, setCommentsTotal });
    } catch (err) {
      console.error(err);
      if (!isAppend) { setComments([]); setCommentsTotal(0); }
    } finally {
      if (isAppend) setCommentsAppending(false);
      else if (!isBackground) setCommentsLoading(false);
    }
  }, [accessPassword, detail, token, loadedCommentsCount, commentsAppending]);

  useEffect(() => {
    void fetchComments(false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally omit fetchComments to avoid re-fetch loops; triggers on data/auth changes only
  }, [detail, accessPassword, token]);

  const handleLoadMoreComments = useCallback(() => {
    if (!commentsLoading && !commentsAppending && commentsHasMore) void fetchComments(true, true);
  }, [commentsLoading, commentsAppending, commentsHasMore, fetchComments]);

  /* v8 ignore start -- scroll-based infinite loading requires real browser viewport */
  useEffect(() => {
    const handleBottomScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
        if (!commentsLoading && !commentsAppending && commentsHasMore && comments.length > 0) handleLoadMoreComments();
      }
    };
    window.addEventListener("scroll", handleBottomScroll);
    return () => window.removeEventListener("scroll", handleBottomScroll);
  }, [commentsLoading, commentsAppending, commentsHasMore, comments.length, handleLoadMoreComments]);
  /* v8 ignore stop */

  const handleSubmitComment = async () => {
    if (!detail || !canAnnotate || annotationSubmitting) return;
    const content = annotationContent.trim();
    if (!content) { showToast("Please enter comment content."); return; }
    setAnnotationSubmitting(true);
    try {
      const created = await apiFetch<ShareComment>(`/public/share/${token}/comments`, {
        method: "POST", requireAuth: false,
        body: JSON.stringify({ password: accessPassword.trim() || undefined, author: guestAuthor || undefined, content }),
      });
      setComments((prev) => [created, ...prev]);
      setCommentsTotal((prev) => prev + 1);
      setLoadedCommentsCount((prev) => prev + 1);
      setAnnotationContent("");
      showToast("Comment added.");
      void fetchComments(true, false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to add comment", 3000);
    } finally {
      setAnnotationSubmitting(false);
    }
  };

  return {
    comments, commentsTotal, commentsLoading,
    annotationContent, setAnnotationContent, annotationSubmitting,
    replyingTo, setReplyingTo, inlineReplyContent, setInlineReplyContent,
    commentsHasMore, handleSubmitComment, handleLoadMoreComments,
  };
}
