"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import type { ShareComment } from "@/types";
import { formatDate, generatePixelAvatar } from "@/lib/utils";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isGuestAuthor, guestFingerprint } from "../utils";
import type { CommentItemProps } from "../types";

function InlineReplyForm({
  targetAuthor, inlineReplyContent, setInlineReplyContent,
  inlineReplySubmitting, onSubmit, onCancel, compact,
}: {
  targetAuthor: string; inlineReplyContent: string; setInlineReplyContent: (v: string) => void;
  inlineReplySubmitting: boolean; onSubmit: () => void; onCancel: () => void; compact?: boolean;
}) {
  const sizeClass = compact ? "text-xs" : "text-sm";
  const btnH = compact ? "h-7" : "h-8";
  const btnText = compact ? "text-[10px]" : "text-xs";
  return (
    <div className={`${compact ? "mt-1 ml-11" : "mt-2 ml-14"} bg-${compact ? "white" : "slate-50"} rounded-xl p-3 border border-slate-200 ${compact ? "shadow-sm" : ""}`}>
      <textarea
        value={inlineReplyContent}
        onChange={(e) => setInlineReplyContent(e.target.value.slice(0, 2000))}
        placeholder={`Reply to ${targetAuthor}...`}
        className={`w-full bg-${compact ? "slate-50" : "white"} rounded-md border border-slate-300 px-3 py-2 ${sizeClass} min-h-[80px] resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500/50`}
      />
      <div className="mt-2 flex items-center justify-between">
        <div className={`${compact ? "text-[10px]" : "text-xs"} text-slate-400`}>{inlineReplyContent.length}/2000</div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} className={`${btnH} ${btnText}`}>Cancel</Button>
          <Button onClick={onSubmit} disabled={inlineReplySubmitting || !inlineReplyContent.trim()} className={`${btnH} ${compact ? "px-3" : "px-4"} ${btnText}`}>
            <Send className={compact ? "mr-1 h-2.5 w-2.5" : "mr-2 h-3 w-3"} />
            {inlineReplySubmitting ? "Posting..." : "REPLY"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReplyItem({
  reply, parentCommentId, replies, replyingToId, canAnnotate,
  onToggleReply, formatDateFn,
}: {
  reply: ShareComment; parentCommentId: string; replies: ShareComment[];
  replyingToId: string | null; canAnnotate: boolean;
  onToggleReply: (reply: ShareComment) => void; formatDateFn: (ts: number) => string;
}) {
  return (
    <div className="flex gap-3 mt-2">
      <div className="w-8 h-8 rounded-full border border-slate-200 flex-shrink-0 overflow-hidden">
        <img src={generatePixelAvatar(reply.author || "Guest")} alt={reply.author || "Guest"} className="w-full h-full object-cover" style={{ imageRendering: "pixelated" }} />
      </div>
      <div className="flex-1 min-w-0 bg-slate-50/80 p-3 rounded-xl border border-slate-200/60 hover:border-slate-300 transition-colors">
        <div className="flex justify-between items-baseline mb-1">
          <div className="font-semibold text-xs text-slate-900 truncate mr-2">
            {reply.author || "Guest"}
            {isGuestAuthor(reply.author) && guestFingerprint(reply.author) && (
              <span className="ml-2 text-[9px] font-mono text-slate-400 align-middle">ID:{guestFingerprint(reply.author)}</span>
            )}
            {reply.reply_to_id !== parentCommentId && reply.reply_to_id && (
              <span className="text-slate-400 font-normal ml-1">
                <span className="inline-block mx-1">▸</span>
                {replies.find(r => r.id === reply.reply_to_id)?.author || "Someone"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-[10px] text-slate-400 whitespace-nowrap">{formatDateFn(reply.ctime)}</div>
            {canAnnotate && (
              <button onClick={() => onToggleReply(reply)} className="text-[10px] font-medium text-slate-400 hover:text-indigo-600 transition-colors">
                {replyingToId === reply.id ? 'Cancel' : 'REPLY'}
              </button>
            )}
          </div>
        </div>
        <div className="text-xs text-slate-700 whitespace-pre-wrap break-words leading-relaxed mb-2">{reply.content}</div>
      </div>
    </div>
  );
}

function CommentBody({ comment, authorName, canAnnotate, replyingToId, onToggleReply }: {
  comment: ShareComment; authorName: string; canAnnotate: boolean; replyingToId: string | null; onToggleReply: () => void;
}) {
  return (
    <div className="flex gap-4">
      <div className="w-10 h-10 rounded-full border border-slate-200 flex-shrink-0 overflow-hidden">
        <img src={generatePixelAvatar(authorName)} alt={authorName} className="w-full h-full object-cover" style={{ imageRendering: "pixelated" }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline mb-1">
          <div className="font-semibold text-sm text-slate-900 truncate mr-2">
            {authorName}
            {isGuestAuthor(comment.author) && guestFingerprint(comment.author) && (
              <span className="ml-2 text-[10px] font-mono text-slate-400 align-middle">ID:{guestFingerprint(comment.author)}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-slate-400 whitespace-nowrap">{formatDate(comment.ctime)}</div>
            {canAnnotate && (
              <button onClick={onToggleReply} className="text-xs font-medium text-slate-400 hover:text-indigo-600 transition-colors">
                {replyingToId === comment.id ? 'Cancel' : 'REPLY'}
              </button>
            )}
          </div>
        </div>
        <div className="text-sm text-slate-700 whitespace-pre-wrap break-words leading-relaxed mb-2">{comment.content}</div>
      </div>
    </div>
  );
}

function RepliesList({ replies, repliesExpanded, repliesLoading, hasMoreReplies, loadedRepliesCount: _lrc,
  parentCommentId, replyingToId, canAnnotate, inlineReplyContent, setInlineReplyContent,
  inlineReplySubmitting, onSubmitReply, onCancelReply, onToggleReply, onLoadMore,
}: {
  replies: ShareComment[]; repliesExpanded: boolean; repliesLoading: boolean;
  hasMoreReplies: boolean; loadedRepliesCount: number;
  parentCommentId: string; replyingToId: string | null; canAnnotate: boolean;
  inlineReplyContent: string; setInlineReplyContent: (v: string) => void;
  inlineReplySubmitting: boolean; onSubmitReply: () => void; onCancelReply: () => void;
  onToggleReply: (reply: ShareComment) => void; onLoadMore: () => void;
}) {
  if (!repliesExpanded) return null;
  return (
    <div className="mt-2 ml-4 pl-4 border-l-2 border-slate-100 space-y-4">
      {replies.map((reply) => (
        <div key={reply.id} className="flex flex-col gap-2">
          <ReplyItem reply={reply} parentCommentId={parentCommentId} replies={replies} replyingToId={replyingToId}
            canAnnotate={canAnnotate} onToggleReply={onToggleReply} formatDateFn={formatDate} />
          {replyingToId === reply.id && (
            <InlineReplyForm targetAuthor={reply.author || "Guest"} inlineReplyContent={inlineReplyContent} setInlineReplyContent={setInlineReplyContent}
              inlineReplySubmitting={inlineReplySubmitting} onSubmit={onSubmitReply} onCancel={onCancelReply} compact />
          )}
        </div>
      ))}
      {repliesLoading && <div className="text-xs text-slate-400 mt-2 ml-4">Loading replies...</div>}
      {hasMoreReplies && !repliesLoading && (
        <button onClick={onLoadMore} className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors ml-4 mt-2">
          Load more replies...
        </button>
      )}
    </div>
  );
}

function mergeByID(base: ShareComment[], incoming: ShareComment[]) {
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

export default function CommentItem({
  comment, token, accessPassword, canAnnotate, replyingToId,
  setReplyingTo, inlineReplyContent, setInlineReplyContent, onToast, guestAuthor,
}: CommentItemProps) {
  const [replies, setReplies] = useState<ShareComment[]>(comment.replies || []);
  const [repliesLoading, setRepliesLoading] = useState(false);
  const [hasMoreReplies, setHasMoreReplies] = useState(false);
  const [inlineReplySubmitting, setInlineReplySubmitting] = useState(false);
  const [repliesExpanded, setRepliesExpanded] = useState((comment.replies?.length || 0) > 0);
  const [loadedRepliesCount, setLoadedRepliesCount] = useState(comment.replies?.length || 0);
  const [replyCount, setReplyCount] = useState<number>(typeof comment.reply_count === "number" ? comment.reply_count : replies.length);

  useEffect(() => {
    if (comment.replies && replies.length === 0) {
      setReplies(comment.replies);
      setLoadedRepliesCount(comment.replies.length);
      if (comment.replies.length > 0) setRepliesExpanded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comment.replies]);

  useEffect(() => {
    if (typeof comment.reply_count === "number" && comment.reply_count > replyCount) setReplyCount(comment.reply_count);
  }, [comment.reply_count, replyCount]);

  useEffect(() => { setHasMoreReplies(replyCount > replies.length); }, [replyCount, replies.length]);

  const fetchReplies = async (offset = 0) => {
    setRepliesLoading(true);
    try {
      const res = await apiFetch<ShareComment[]>(`/public/share/${token}/comments/${comment.id}/replies?limit=10&offset=${offset}${accessPassword.trim() ? `&password=${accessPassword.trim()}` : ''}`, { requireAuth: false });
      if (offset === 0) { setReplies(res); setLoadedRepliesCount(res.length); }
      else { setReplies(prev => mergeByID(prev, res)); setLoadedRepliesCount((prev) => prev + res.length); }
      setRepliesExpanded(true);
    } catch (err) {
      console.error("Failed to load replies:", err);
    } finally { setRepliesLoading(false); }
  };

  const handleSubmitInlineReply = async () => {
    if (!canAnnotate || inlineReplySubmitting || !replyingToId) return;
    const content = inlineReplyContent.trim();
    if (!content) return;
    setInlineReplySubmitting(true);
    try {
      const created = await apiFetch<ShareComment>(`/public/share/${token}/comments`, {
        method: "POST", requireAuth: false,
        body: JSON.stringify({ password: accessPassword.trim() || undefined, author: guestAuthor || undefined, content, reply_to_id: replyingToId }),
      });
      setReplies(prev => mergeByID(prev, [created]));
      setReplyCount((prev) => prev + 1);
      setRepliesExpanded(true);
      setInlineReplyContent("");
      setReplyingTo(null);
    } catch (err) {
      console.error(err);
      onToast(err instanceof Error ? err.message : "Failed to add reply", 3000);
    } finally { setInlineReplySubmitting(false); }
  };

  const handleToggleReply = useCallback((reply: ShareComment) => {
    setReplyingTo(replyingToId === reply.id ? null : { id: reply.id, author: reply.author || "Guest" });
    setInlineReplyContent("");
  }, [replyingToId, setReplyingTo, setInlineReplyContent]);

  const authorName = comment.author || "Guest";

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl border border-slate-200/60 bg-white shadow-sm hover:border-slate-300 hover:shadow-md transition-all duration-200">
      <CommentBody comment={comment} authorName={authorName} canAnnotate={canAnnotate} replyingToId={replyingToId}
        onToggleReply={() => { setReplyingTo(replyingToId === comment.id ? null : { id: comment.id, author: authorName }); setInlineReplyContent(""); }} />

      {replyingToId === comment.id && (
        <InlineReplyForm targetAuthor={authorName} inlineReplyContent={inlineReplyContent} setInlineReplyContent={setInlineReplyContent}
          inlineReplySubmitting={inlineReplySubmitting} onSubmit={() => void handleSubmitInlineReply()} onCancel={() => setReplyingTo(null)} />
      )}

      {replyCount > 0 && !repliesExpanded && (
        <div className="mt-1 ml-14">
          <button onClick={() => { if (replies.length === 0) void fetchReplies(0); else setRepliesExpanded(true); }}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1">
            <span className="inline-block transform rotate-90 scale-y-125 text-[10px] text-indigo-400">▸</span>
            View {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
          </button>
        </div>
      )}

      <RepliesList replies={replies} repliesExpanded={repliesExpanded} repliesLoading={repliesLoading}
        hasMoreReplies={hasMoreReplies} loadedRepliesCount={loadedRepliesCount}
        parentCommentId={comment.id} replyingToId={replyingToId} canAnnotate={canAnnotate}
        inlineReplyContent={inlineReplyContent} setInlineReplyContent={setInlineReplyContent}
        inlineReplySubmitting={inlineReplySubmitting} onSubmitReply={() => void handleSubmitInlineReply()}
        onCancelReply={() => setReplyingTo(null)} onToggleReply={handleToggleReply}
        onLoadMore={() => void fetchReplies(loadedRepliesCount)} />
    </div>
  );
}
