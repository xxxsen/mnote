"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { formatDate, generatePixelAvatar } from "@/lib/utils";
import { Clock, User, Tag as TagIcon, ArrowUp, Link2, Download, Menu, X, ChevronRight, Send, Eye, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSharePage } from "./hooks/useSharePage";
import { estimateReadingTime } from "./utils";
import SharedContent from "./components/SharedContent";
import CommentItem from "./components/CommentItem";

export default function SharePage() {
  const {
    token,
    detail,
    doc,
    loading,
    error,
    previewRef,
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
  } = useSharePage();

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
              <div
                className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border whitespace-nowrap ${
                  canAnnotate
                    ? "bg-cyan-50 text-cyan-700 border-cyan-200"
                    : "bg-slate-100 text-slate-600 border-slate-200"
                }`}
                title={permissionHint}
                aria-label={permissionHint}
              >
                {canAnnotate ? <PencilLine className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                <span>{permissionLabel}</span>
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

        <SharedContent
          previewRef={previewRef}
          content={doc.content}
          handleTocLoaded={handleTocLoaded}
        />

        <div className="w-full mt-12 bg-white rounded-2xl shadow-[0_10px_40px_-15px_rgba(0,0,0,0.1)] border border-slate-200/50 p-6 md:p-12 lg:p-16">
          <h2 className="text-2xl font-bold text-slate-800 mb-8">Comments ({commentsTotal})</h2>

          {canAnnotate && (
            <div className="mb-10 bg-slate-50 rounded-xl p-4 border border-slate-200">
              <textarea
                value={annotationContent}
                onChange={(e) => setAnnotationContent(e.target.value.slice(0, 2000))}
                placeholder="Leave a comment..."
                className="w-full bg-white rounded-md border border-slate-300 px-4 py-3 text-sm min-h-[120px] resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
              <div className="mt-3 flex items-center justify-between">
                <div className="text-xs text-slate-400">{annotationContent.length}/2000</div>
                <Button onClick={() => void handleSubmitComment()} disabled={annotationSubmitting || !annotationContent.trim()} className="h-10 px-6">
                  <Send className="mr-2 h-4 w-4" />
                  {annotationSubmitting ? "Posting..." : "Comment"}
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
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  token={token}
                  accessPassword={accessPassword}
                  canAnnotate={canAnnotate}
                  replyingToId={replyingTo?.id || null}
                  setReplyingTo={setReplyingTo}
                  inlineReplyContent={inlineReplyContent}
                  setInlineReplyContent={setInlineReplyContent}
                  onToast={showToast}
                  guestAuthor={guestAuthor}
                />
              ))
            )}

            {!commentsLoading && commentsHasMore && comments.length > 0 && (
              <div className="text-center pt-4">
                <Button variant="ghost" onClick={handleLoadMoreComments} className="text-slate-500 hover:text-slate-700">
                  Load more comments
                </Button>
              </div>
            )}
            {commentsLoading && comments.length > 0 && (
              <div className="text-center py-4 text-slate-500 text-sm">Loading more...</div>
            )}

          </div>
        </div>

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
