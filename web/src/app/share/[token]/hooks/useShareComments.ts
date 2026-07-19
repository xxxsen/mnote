"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  notify: (message: string, variant?: "default" | "success" | "error") => void;
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
  const { detail, token, accessPassword, canAnnotate, guestAuthor, notify } = opts;
  const [comments, setComments] = useState<ShareComment[]>([]);
  const [commentsTotal, setCommentsTotal] = useState(0);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [annotationContent, setAnnotationContent] = useState("");
  const [annotationSubmitting, setAnnotationSubmitting] = useState(false);
  const [annotationError, setAnnotationError] = useState("");
  const [replyingTo, setReplyingTo] = useState<{ id: string; author: string } | null>(null);
  const [inlineReplyContent, setInlineReplyContent] = useState("");
  const [commentsHasMore, setCommentsHasMore] = useState(true);
  const [commentsAppending, setCommentsAppending] = useState(false);
  const [loadedCommentsCount, setLoadedCommentsCount] = useState(0);
  const [commentsError, setCommentsError] = useState("");
  const appendRef = useRef(false);
  const submitRef = useRef(false);

  const fetchComments = useCallback(async (isBackground: boolean, isAppend: boolean) => {
    if (!detail) {
      if (!isAppend) { setComments([]); setCommentsTotal(0); setLoadedCommentsCount(0); } /* v8 ignore -- append with null detail is unreachable */
      return;
    }
    if (isAppend) {
      if (appendRef.current) return;
      appendRef.current = true;
      setCommentsAppending(true);
    } else if (!isBackground) {
      setCommentsLoading(true);
    }
    setCommentsError("");
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
      setCommentsError(isAppend
        ? "Could not load more comments."
        : "Could not load comments.");
    } finally {
      if (isAppend) {
        appendRef.current = false;
        setCommentsAppending(false);
      }
      else if (!isBackground) setCommentsLoading(false);
    }
  }, [accessPassword, detail, token, loadedCommentsCount]);

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

  const handleSubmitComment = useCallback(async () => {
    if (!detail || !canAnnotate || submitRef.current) return;
    const content = annotationContent.trim();
    if (!content) {
      setAnnotationError("Enter a comment before posting.");
      notify("Enter a comment before posting.", "error");
      return;
    }
    submitRef.current = true;
    setAnnotationSubmitting(true);
    setAnnotationError("");
    try {
      const created = await apiFetch<ShareComment>(`/public/share/${token}/comments`, {
        method: "POST", requireAuth: false,
        body: JSON.stringify({ password: accessPassword.trim() || undefined, author: guestAuthor || undefined, content }),
      });
      setComments((prev) => [created, ...prev]);
      setCommentsTotal((prev) => prev + 1);
      setLoadedCommentsCount((prev) => prev + 1);
      setAnnotationContent("");
      notify("Comment added.", "success");
    } catch {
      setAnnotationError("Could not add the comment. Try again.");
      notify("Could not add the comment. Try again.", "error");
    } finally {
      submitRef.current = false;
      setAnnotationSubmitting(false);
    }
  }, [detail, canAnnotate, annotationContent, token, accessPassword, guestAuthor, notify]);

  return {
    comments, commentsTotal, commentsLoading, commentsAppending, commentsError,
    annotationContent, setAnnotationContent, annotationSubmitting, annotationError,
    replyingTo, setReplyingTo, inlineReplyContent, setInlineReplyContent,
    commentsHasMore, handleSubmitComment, handleLoadMoreComments,
    retryComments: () => void fetchComments(false, false),
  };
}
