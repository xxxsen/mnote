"use client";

import Link from "next/link";
import { ArrowUp, Link2, Download, Menu, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ShareComment } from "@/types";
import { useSharePage } from "./hooks/useSharePage";
import SharedContent from "./components/SharedContent";
import CommentItem from "./components/CommentItem";
import { ShareHeader } from "./components/ShareHeader";
import { FloatingToc, MobileToc } from "./components/ShareTocPanels";

export default function SharePage() {
  const {
    token, detail, doc, loading, error, previewRef, canAnnotate,
    permissionLabel, permissionHint, tocContent, showFloatingToc,
    tocCollapsed, setTocCollapsed, showMobileToc, setShowMobileToc,
    handleTocLoaded, scrollProgress, showScrollTop, toast, showToast,
    sharePasswordInput, setSharePasswordInput, accessPassword, setAccessPassword,
    passwordRequired, passwordError, setLoading,
    comments, commentsTotal, commentsLoading, annotationContent, setAnnotationContent,
    annotationSubmitting, replyingTo, setReplyingTo, inlineReplyContent, setInlineReplyContent,
    commentsHasMore, handleSubmitComment, handleLoadMoreComments, guestAuthor,
    handleCopyLink, handleExport, slugify, getElementById, scrollToElement,
  } = useSharePage();

  if (loading) return <div className="flex h-screen items-center justify-center">Loading...</div>;
  if (passwordRequired) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm bg-white border border-slate-200/70 rounded-2xl shadow-xl p-6 space-y-4">
          <h1 className="text-lg font-bold text-slate-900">Protected Share</h1>
          <p className="text-sm text-slate-500">This note is password protected.</p>
          <input type="password" value={sharePasswordInput} onChange={(e) => setSharePasswordInput(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm" placeholder="Enter password" />
          {passwordError && <div className="text-xs text-red-500">{passwordError}</div>}
          <Button className="w-full" onClick={() => { setLoading(true); setAccessPassword(sharePasswordInput.trim()); }}>Continue</Button>
        </div>
      </div>
    );
  }
  if (error || !doc || !detail) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-md bg-white border border-slate-200/70 rounded-2xl shadow-xl p-8 text-center">
          <div className="mx-auto w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xl font-bold">M</div>
          <div className="mt-4 text-xs font-mono text-slate-500 uppercase tracking-widest">Micro Note</div>
          <h1 className="mt-3 text-xl font-bold text-slate-900">Share link unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">This note may have been deleted, moved, or the link has expired.</p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link href="/"><Button className="rounded-full px-5">Go Home</Button></Link>
            <Link href="/login"><Button variant="outline" className="rounded-full px-5">Sign In</Button></Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center selection:bg-indigo-100">
      <div className="fixed top-0 left-0 w-full h-1 z-50 bg-transparent">
        <div className="h-full bg-indigo-500 transition-all duration-150 ease-out" style={{ width: `${scrollProgress}%` }} />
      </div>

      <FloatingActionButtons
        showScrollTop={showScrollTop} onShowMobileToc={() => setShowMobileToc(true)}
        onCopyLink={handleCopyLink} onExport={handleExport}
        downloadDisabled={detail.allow_download === 0}
      />

      <div className="w-full max-w-4xl px-4 md:px-0 py-12 md:py-20 flex flex-col items-center">
        <ShareHeader doc={doc} detail={detail} canAnnotate={canAnnotate} permissionLabel={permissionLabel} permissionHint={permissionHint} />

        {doc.summary && (
          <div className="w-full mb-8 rounded-2xl border border-slate-200/70 bg-white/70 p-6 shadow-[0_6px_20px_-12px_rgba(15,23,42,0.25)]">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">AI Summary</div>
            <p className="mt-3 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{doc.summary}</p>
          </div>
        )}

        <SharedContent previewRef={previewRef} content={doc.content} handleTocLoaded={handleTocLoaded} />

        <CommentsSection
          commentsTotal={commentsTotal} canAnnotate={canAnnotate} annotationContent={annotationContent}
          setAnnotationContent={setAnnotationContent} annotationSubmitting={annotationSubmitting}
          onSubmitComment={handleSubmitComment} commentsLoading={commentsLoading} comments={comments}
          token={token} accessPassword={accessPassword} replyingTo={replyingTo} setReplyingTo={setReplyingTo}
          inlineReplyContent={inlineReplyContent} setInlineReplyContent={setInlineReplyContent}
          showToast={showToast} guestAuthor={guestAuthor} commentsHasMore={commentsHasMore}
          onLoadMore={handleLoadMoreComments}
        />

        <footer className="w-full mt-16 pt-12 border-t border-slate-200 flex flex-col items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-3 grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all cursor-pointer">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white font-bold text-xl shadow-lg">M</div>
            <div className="flex flex-col">
              <span className="font-bold text-slate-900 leading-none">Micro Note</span>
              <span className="text-[10px] text-slate-500 font-mono tracking-wider">PERSONAL KNOWLEDGE BASE</span>
            </div>
          </Link>
          <p className="text-slate-400 text-xs font-medium tracking-wide uppercase">Published with Micro Note &bull; {new Date().getFullYear()}</p>
          <Link href="/"><Button variant="outline" className="rounded-full px-6 border-slate-200 hover:bg-slate-50 transition-colors">Create your own note</Button></Link>
        </footer>
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="bg-slate-900 text-white px-4 py-2 rounded-full text-sm font-medium shadow-2xl flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />{toast}
          </div>
        </div>
      )}

      {showFloatingToc && tocContent && (
        <FloatingToc tocContent={tocContent} tocCollapsed={tocCollapsed} setTocCollapsed={setTocCollapsed}
          slugify={slugify} getElementById={getElementById} scrollToElement={scrollToElement} />
      )}
      {showMobileToc && (
        <MobileToc tocContent={tocContent} onClose={() => setShowMobileToc(false)}
          getElementById={getElementById} slugify={slugify} scrollToElement={scrollToElement} />
      )}
    </div>
  );
}

function FloatingActionButtons({ showScrollTop, onShowMobileToc, onCopyLink, onExport, downloadDisabled }: {
  showScrollTop: boolean; onShowMobileToc: () => void; onCopyLink: () => void; onExport: () => void; downloadDisabled: boolean;
}) {
  return (
    <div className="fixed bottom-8 right-8 flex flex-col gap-3 z-40">
      {showScrollTop && (
        <Button size="icon" variant="outline" className="rounded-full shadow-lg bg-background/80 backdrop-blur-sm border-border hover:bg-background"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}><ArrowUp className="h-4 w-4" /></Button>
      )}
      <Button size="icon" variant="outline" className="rounded-full shadow-lg bg-background/80 backdrop-blur-sm border-border hover:bg-background xl:hidden"
        onClick={onShowMobileToc} title="Table of Contents"><Menu className="h-4 w-4" /></Button>
      <Button size="icon" variant="outline" className="rounded-full shadow-lg bg-background/80 backdrop-blur-sm border-border hover:bg-background"
        onClick={onCopyLink} title="Copy Link"><Link2 className="h-4 w-4" /></Button>
      <Button size="icon" variant="outline" className="rounded-full shadow-lg bg-background/80 backdrop-blur-sm border-border hover:bg-background"
        onClick={onExport} title={downloadDisabled ? "Download disabled by owner" : "Export Markdown"} disabled={downloadDisabled}><Download className="h-4 w-4" /></Button>
    </div>
  );
}

function CommentsSection({ commentsTotal, canAnnotate, annotationContent, setAnnotationContent, annotationSubmitting, onSubmitComment,
  commentsLoading, comments, token, accessPassword, replyingTo, setReplyingTo, inlineReplyContent, setInlineReplyContent,
  showToast, guestAuthor, commentsHasMore, onLoadMore,
}: {
  commentsTotal: number; canAnnotate: boolean; annotationContent: string; setAnnotationContent: (v: string) => void;
  annotationSubmitting: boolean; onSubmitComment: () => Promise<void>; commentsLoading: boolean;
  comments: ShareComment[]; token: string; accessPassword: string;
  replyingTo: { id: string; author: string } | null; setReplyingTo: (v: { id: string; author: string } | null) => void;
  inlineReplyContent: string; setInlineReplyContent: (v: string) => void;
  showToast: (msg: string, dur?: number) => void; guestAuthor: string; commentsHasMore: boolean; onLoadMore: () => void;
}) {
  return (
    <div className="w-full mt-12 bg-white rounded-2xl shadow-[0_10px_40px_-15px_rgba(0,0,0,0.1)] border border-slate-200/50 p-6 md:p-12 lg:p-16">
      <h2 className="text-2xl font-bold text-slate-800 mb-8">Comments ({commentsTotal})</h2>
      {canAnnotate && (
        <div className="mb-10 bg-slate-50 rounded-xl p-4 border border-slate-200">
          <textarea value={annotationContent} onChange={(e) => setAnnotationContent(e.target.value.slice(0, 2000))}
            placeholder="Leave a comment..." className="w-full bg-white rounded-md border border-slate-300 px-4 py-3 text-sm min-h-[120px] resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
          <div className="mt-3 flex items-center justify-between">
            <div className="text-xs text-slate-400">{annotationContent.length}/2000</div>
            <Button onClick={() => void onSubmitComment()} disabled={annotationSubmitting || !annotationContent.trim()} className="h-10 px-6">
              <Send className="mr-2 h-4 w-4" />{annotationSubmitting ? "Posting..." : "Comment"}
            </Button>
          </div>
        </div>
      )}
      <div className="space-y-6">
        {commentsLoading ? (
          <div className="text-center py-8 text-slate-500 text-sm">Loading comments...</div>
        ) : comments.length === 0 ? (
          <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            No comments yet. {canAnnotate && "Be the first to share your thoughts!"}
          </div>
        ) : (
          comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} token={token} accessPassword={accessPassword}
              canAnnotate={canAnnotate} replyingToId={replyingTo?.id || null} setReplyingTo={setReplyingTo}
              inlineReplyContent={inlineReplyContent} setInlineReplyContent={setInlineReplyContent}
              onToast={showToast} guestAuthor={guestAuthor} />
          ))
        )}
        {!commentsLoading && commentsHasMore && comments.length > 0 && (
          <div className="text-center pt-4">
            <Button variant="ghost" onClick={onLoadMore} className="text-slate-500 hover:text-slate-700">Load more comments</Button>
          </div>
        )}
        {commentsLoading && comments.length > 0 && (
          <div className="text-center py-4 text-slate-500 text-sm">Loading more...</div>
        )}
      </div>
    </div>
  );
}
