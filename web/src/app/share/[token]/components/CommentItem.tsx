"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { formatDate, generatePixelAvatar } from "@/lib/utils";
import type { ShareComment } from "@/types";

import type { CommentItemProps } from "../types";
import { guestFingerprint, isGuestAuthor } from "../utils";

function mergeByID(base: ShareComment[], incoming: ShareComment[]) {
  const seen = new Set(base.map((item) => item.id));
  return [...base, ...incoming.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  })];
}

function AuthorAvatar({ author, size = "md" }: { author: string; size?: "sm" | "md" }) {
  return (
    <div className={`${size === "sm" ? "h-8 w-8" : "h-10 w-10"} shrink-0 overflow-hidden rounded-full border border-border`}>
      <img
        src={generatePixelAvatar(author)}
        alt=""
        className="h-full w-full object-cover"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  );
}

function AuthorName({ author, compact = false }: { author: string; compact?: boolean }) {
  const fingerprint = isGuestAuthor(author) ? guestFingerprint(author) : "";
  return (
    <span className={`${compact ? "text-xs" : "text-sm"} min-w-0 truncate font-semibold text-foreground`}>
      {author}
      {fingerprint ? (
        <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
          ID:{fingerprint}
        </span>
      ) : null}
    </span>
  );
}

function ReplyForm({
  targetAuthor,
  content,
  setContent,
  submitting,
  error,
  onSubmit,
  onCancel,
}: {
  targetAuthor: string;
  content: string;
  setContent: (value: string) => void;
  submitting: boolean;
  error: string;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const inputId = `reply-${targetAuthor.replaceAll(/[^a-zA-Z0-9]/g, "-")}`;
  return (
    <form
      className="ml-0 mt-3 rounded-xl border border-border bg-muted/40 p-3 sm:ml-12"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor={inputId} className="mb-2 block text-sm font-medium">
        Reply to {targetAuthor}
      </label>
      <textarea
        id={inputId}
        value={content}
        onChange={(event) => setContent(event.target.value.slice(0, 2000))}
        className="min-h-20 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        maxLength={2000}
        aria-invalid={Boolean(error)}
        aria-describedby={`${inputId}-count${error ? ` ${inputId}-error` : ""}`}
      />
      {error ? (
        <p id={`${inputId}-error`} role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span id={`${inputId}-count`} className="text-xs text-muted-foreground">
          {content.length}/2000 characters
        </span>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" size="sm" isLoading={submitting} disabled={!content.trim()}>
            <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Post reply
          </Button>
        </div>
      </div>
    </form>
  );
}

function ReplyRow({
  reply,
  canAnnotate,
  active,
  onToggleReply,
}: {
  reply: ShareComment;
  canAnnotate: boolean;
  active: boolean;
  onToggleReply: () => void;
}) {
  const author = reply.author || "Guest";
  return (
    <div className="flex gap-3 rounded-xl border border-border bg-muted/30 p-3">
      <AuthorAvatar author={author} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <AuthorName author={author} compact />
          <div className="flex items-center gap-2">
            <time className="text-xs text-muted-foreground">{formatDate(reply.ctime)}</time>
            {canAnnotate ? (
              <Button type="button" variant="ghost" size="sm" onClick={onToggleReply}>
                {active ? "Cancel" : "Reply"}
              </Button>
            ) : null}
          </div>
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
          {reply.content}
        </p>
      </div>
    </div>
  );
}

type CommentItemViewProps = {
  comment: ShareComment;
  author: string;
  canAnnotate: boolean;
  replyingToId: string | null;
  inlineReplyContent: string;
  setInlineReplyContent: (value: string) => void;
  setReplyingTo: CommentItemProps["setReplyingTo"];
  replySubmitting: boolean;
  replyError: string;
  replyCount: number;
  replies: ShareComment[];
  repliesExpanded: boolean;
  setRepliesExpanded: (value: boolean) => void;
  repliesLoading: boolean;
  repliesError: string;
  hasMoreReplies: boolean;
  activeTargetFound: boolean;
  toggleReply: (reply: ShareComment) => void;
  fetchReplies: () => Promise<void>;
  submitReply: () => Promise<void>;
};

function CommentItemView(props: CommentItemViewProps) {
  return (
    <article className="rounded-xl border border-border bg-background p-4">
      <div className="flex gap-3">
        <AuthorAvatar author={props.author} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <AuthorName author={props.author} />
            <div className="flex items-center gap-2">
              <time className="text-xs text-muted-foreground">{formatDate(props.comment.ctime)}</time>
              {props.canAnnotate ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => props.toggleReply(props.comment)}
                >
                  {props.replyingToId === props.comment.id ? "Cancel" : "Reply"}
                </Button>
              ) : null}
            </div>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
            {props.comment.content}
          </p>
        </div>
      </div>

      {props.replyingToId === props.comment.id ? (
        <ReplyForm
          targetAuthor={props.author}
          content={props.inlineReplyContent}
          setContent={props.setInlineReplyContent}
          submitting={props.replySubmitting}
          error={props.replyError}
          onSubmit={() => void props.submitReply()}
          onCancel={() => props.setReplyingTo(null)}
        />
      ) : null}

      {props.replyCount > 0 && !props.repliesExpanded ? (
        <div className="ml-0 mt-3 sm:ml-12">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            isLoading={props.repliesLoading}
            onClick={() => {
              if (props.replies.length > 0) props.setRepliesExpanded(true);
              else void props.fetchReplies();
            }}
          >
            View {props.replyCount} {props.replyCount === 1 ? "reply" : "replies"}
          </Button>
        </div>
      ) : null}

      {props.repliesExpanded ? (
        <div className="ml-0 mt-3 space-y-3 border-l-2 border-border pl-3 sm:ml-12">
          {props.replies.map((reply) => (
            <div key={reply.id}>
              <ReplyRow
                reply={reply}
                canAnnotate={props.canAnnotate}
                active={props.replyingToId === reply.id}
                onToggleReply={() => props.toggleReply(reply)}
              />
              {props.replyingToId === reply.id ? (
                <ReplyForm
                  targetAuthor={reply.author || "Guest"}
                  content={props.inlineReplyContent}
                  setContent={props.setInlineReplyContent}
                  submitting={props.replySubmitting}
                  error={props.replyError}
                  onSubmit={() => void props.submitReply()}
                  onCancel={() => props.setReplyingTo(null)}
                />
              ) : null}
            </div>
          ))}
          {props.repliesError ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2 text-sm text-destructive">
              <span>{props.repliesError}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => void props.fetchReplies()}>
                Retry
              </Button>
            </div>
          ) : null}
          {props.hasMoreReplies ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              isLoading={props.repliesLoading}
              onClick={() => void props.fetchReplies()}
            >
              Load more replies
            </Button>
          ) : null}
        </div>
      ) : null}

      {props.replyingToId && !props.activeTargetFound ? (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          Select the original comment again to continue replying.
        </p>
      ) : null}
    </article>
  );
}

export default function CommentItem({
  comment,
  token,
  accessPassword,
  canAnnotate,
  replyingToId,
  setReplyingTo,
  inlineReplyContent,
  setInlineReplyContent,
  notify,
  guestAuthor,
}: CommentItemProps) {
  const [replies, setReplies] = useState<ShareComment[]>(comment.replies || []);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [repliesError, setRepliesError] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyError, setReplyError] = useState("");
  const [repliesExpanded, setRepliesExpanded] = useState((comment.replies?.length || 0) > 0);
  const [replyCount, setReplyCount] = useState(comment.reply_count ?? comment.replies?.length ?? 0);
  const repliesRequestRef = useRef(false);
  const replySubmitRef = useRef(false);

  useEffect(() => {
    setReplyCount((current) => Math.max(current, comment.reply_count ?? 0));
  }, [comment.reply_count]);

  const fetchReplies = useCallback(async () => {
    if (repliesRequestRef.current) return;
    repliesRequestRef.current = true;
    setRepliesLoading(true);
    setRepliesError("");
    try {
      const query = new URLSearchParams({
        limit: "10",
        offset: String(replies.length),
      });
      if (accessPassword.trim()) query.set("password", accessPassword.trim());
      const result = await apiFetch<ShareComment[]>(
        `/public/share/${token}/comments/${comment.id}/replies?${query.toString()}`,
        { requireAuth: false },
      );
      setReplies((current) => mergeByID(current, result));
      setRepliesExpanded(true);
    } catch {
      setRepliesError("Could not load replies.");
    } finally {
      repliesRequestRef.current = false;
      setRepliesLoading(false);
    }
  }, [accessPassword, comment.id, replies.length, token]);

  const submitReply = useCallback(async () => {
    if (!canAnnotate || !replyingToId || replySubmitRef.current) return;
    const content = inlineReplyContent.trim();
    if (!content) {
      setReplyError("Enter a reply before posting.");
      return;
    }
    replySubmitRef.current = true;
    setReplySubmitting(true);
    setReplyError("");
    try {
      const created = await apiFetch<ShareComment>(`/public/share/${token}/comments`, {
        method: "POST",
        requireAuth: false,
        body: JSON.stringify({
          password: accessPassword.trim() || undefined,
          author: guestAuthor || undefined,
          content,
          reply_to_id: replyingToId,
        }),
      });
      setReplies((current) => mergeByID(current, [created]));
      setReplyCount((current) => current + 1);
      setRepliesExpanded(true);
      setInlineReplyContent("");
      setReplyingTo(null);
      notify("Reply added.", "success");
    } catch {
      setReplyError("Could not add the reply. Try again.");
      notify("Could not add the reply. Try again.", "error");
    } finally {
      replySubmitRef.current = false;
      setReplySubmitting(false);
    }
  }, [
    accessPassword,
    canAnnotate,
    guestAuthor,
    inlineReplyContent,
    notify,
    replyingToId,
    setInlineReplyContent,
    setReplyingTo,
    token,
  ]);

  const toggleReply = useCallback((reply: ShareComment) => {
    const author = reply.author || "Guest";
    setReplyError("");
    setInlineReplyContent("");
    setReplyingTo(replyingToId === reply.id ? null : { id: reply.id, author });
  }, [replyingToId, setInlineReplyContent, setReplyingTo]);

  const author = comment.author || "Guest";
  const activeTarget = replyingToId
    ? [comment, ...replies].find((item) => item.id === replyingToId)
    : undefined;
  const hasMoreReplies = replyCount > replies.length;

  return (
    <CommentItemView
      comment={comment}
      author={author}
      canAnnotate={canAnnotate}
      replyingToId={replyingToId}
      inlineReplyContent={inlineReplyContent}
      setInlineReplyContent={setInlineReplyContent}
      setReplyingTo={setReplyingTo}
      replySubmitting={replySubmitting}
      replyError={replyError}
      replyCount={replyCount}
      replies={replies}
      repliesExpanded={repliesExpanded}
      setRepliesExpanded={setRepliesExpanded}
      repliesLoading={repliesLoading}
      repliesError={repliesError}
      hasMoreReplies={hasMoreReplies}
      activeTargetFound={Boolean(activeTarget)}
      toggleReply={toggleReply}
      fetchReplies={fetchReplies}
      submitReply={submitReply}
    />
  );
}
