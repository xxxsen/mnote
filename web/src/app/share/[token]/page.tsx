"use client";

import Link from "next/link";
import { ArrowUp, Download, Link2, List, Send } from "lucide-react";

import { AuthShell } from "@/components/auth-shell";
import { ReadingSurface } from "@/components/reading-surface";
import { Button, buttonVariants } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { PageState } from "@/components/ui/page-state";
import type { ShareComment } from "@/types";

import CommentItem from "./components/CommentItem";
import { ShareHeader } from "./components/ShareHeader";
import { FloatingToc, MobileToc } from "./components/ShareTocPanels";
import SharedContent from "./components/SharedContent";
import { useSharePage } from "./hooks/useSharePage";

export default function SharePage() {
  const share = useSharePage();

  if (share.loading) {
    return (
      <AuthShell title="Shared note" description="Loading the published note.">
        <PageState compact kind="loading" title="Loading shared note" />
      </AuthShell>
    );
  }
  if (share.passwordRequired) return <PasswordState share={share} />;
  if (share.error || !share.doc || !share.detail) return <UnavailableState onRetry={share.retryShare} />;

  return (
    <div className="min-h-dvh bg-muted/30 selection:bg-info/20">
      <div
        role="progressbar"
        aria-label="Reading progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share.scrollProgress)}
        className="fixed left-0 top-0 z-50 h-1 w-full bg-transparent"
      >
        <div
          className="h-full bg-primary transition-[width] duration-150 motion-reduce:transition-none"
          style={{ width: `${share.scrollProgress}%` }}
        />
      </div>

      <FloatingActionButtons
        hasToc={Boolean(share.tocContent)}
        showScrollTop={share.showScrollTop}
        onShowMobileToc={() => share.setShowMobileToc(true)}
        onCopyLink={() => void share.handleCopyLink()}
        onExport={share.handleExport}
        downloadDisabled={share.detail.allow_download === 0}
      />

      <main
        aria-labelledby="share-title"
        className="mx-auto w-full max-w-[1280px] px-4 py-12 md:px-8 md:py-20"
      >
        <div className="mx-auto w-full max-w-4xl">
          <ShareHeader
            doc={share.doc}
            detail={share.detail}
            canAnnotate={share.canAnnotate}
            permissionLabel={share.permissionLabel}
            permissionHint={share.permissionHint}
          />

          <SharedContent
            previewRef={share.previewRef}
            content={share.doc.content}
            handleTocLoaded={share.handleTocLoaded}
          />

          <CommentsSection
            commentsTotal={share.commentsTotal}
            canAnnotate={share.canAnnotate}
            annotationContent={share.annotationContent}
            setAnnotationContent={share.setAnnotationContent}
            annotationSubmitting={share.annotationSubmitting}
            annotationError={share.annotationError}
            onSubmitComment={share.handleSubmitComment}
            commentsLoading={share.commentsLoading}
            commentsAppending={share.commentsAppending}
            commentsError={share.commentsError}
            comments={share.comments}
            token={share.token}
            accessPassword={share.accessPassword}
            replyingTo={share.replyingTo}
            setReplyingTo={share.setReplyingTo}
            inlineReplyContent={share.inlineReplyContent}
            setInlineReplyContent={share.setInlineReplyContent}
            notify={share.notify}
            guestAuthor={share.guestAuthor}
            commentsHasMore={share.commentsHasMore}
            onLoadMore={share.handleLoadMoreComments}
            onRetry={share.retryComments}
          />

          <ShareFooter />
        </div>
      </main>

      {share.showFloatingToc && share.tocContent ? (
        <FloatingToc
          tocContent={share.tocContent}
          tocCollapsed={share.tocCollapsed}
          setTocCollapsed={share.setTocCollapsed}
          slugify={share.slugify}
          getElementById={share.getElementById}
          scrollToElement={share.scrollToElement}
        />
      ) : null}
      {share.showMobileToc ? (
        <MobileToc
          tocContent={share.tocContent}
          onClose={() => share.setShowMobileToc(false)}
          getElementById={share.getElementById}
          slugify={share.slugify}
          scrollToElement={share.scrollToElement}
        />
      ) : null}
    </div>
  );
}

type ShareState = ReturnType<typeof useSharePage>;

function PasswordState({ share }: { share: ShareState }) {
  return (
    <AuthShell
      title="Protected share"
      description="Enter the password provided by the note owner."
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          share.submitPassword();
        }}
      >
        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="share-password">
            Share password
          </label>
          <Input
            id="share-password"
            type="password"
            autoComplete="current-password"
            value={share.sharePasswordInput}
            onChange={(event) => share.setSharePasswordInput(event.target.value)}
            aria-invalid={Boolean(share.passwordError)}
            aria-describedby={share.passwordError ? "share-password-error" : undefined}
            autoFocus
            required
          />
        </div>
        {share.passwordError ? (
          <p
            id="share-password-error"
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {share.passwordError}
          </p>
        ) : null}
        <Button type="submit" className="w-full">Continue</Button>
      </form>
    </AuthShell>
  );
}

function UnavailableState({ onRetry }: { onRetry: () => void }) {
  return (
    <AuthShell
      title="Share link unavailable"
      description="The note may have been deleted, moved, or the link may have expired."
    >
      <div className="space-y-4">
        <PageState
          compact
          kind="error"
          title="Could not open this note"
          description="Check the link or try the request again."
          actionLabel="Retry"
          onAction={onRetry}
        />
        <div className="grid grid-cols-2 gap-2">
          <Link href="/" className={buttonVariants()}>Go home</Link>
          <Link href="/login" className={buttonVariants({ variant: "outline" })}>Sign in</Link>
        </div>
      </div>
    </AuthShell>
  );
}

function FloatingActionButtons({
  hasToc,
  showScrollTop,
  onShowMobileToc,
  onCopyLink,
  onExport,
  downloadDisabled,
}: {
  hasToc: boolean;
  showScrollTop: boolean;
  onShowMobileToc: () => void;
  onCopyLink: () => void;
  onExport: () => void;
  downloadDisabled: boolean;
}) {
  return (
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2 md:bottom-8 md:right-8">
      {downloadDisabled ? (
        <span id="download-disabled-note" className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground shadow-sm">
          Downloads disabled by owner
        </span>
      ) : null}
      <div className="flex flex-col gap-2">
        {showScrollTop ? (
          <IconButton
            type="button"
            label="Back to top"
            variant="outline"
            className="bg-background/95 shadow-md"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        ) : null}
        {hasToc ? (
          <IconButton
            type="button"
            label="Open table of contents"
            variant="outline"
            className="bg-background/95 shadow-md 2xl:hidden"
            onClick={onShowMobileToc}
          >
            <List className="h-4 w-4" aria-hidden="true" />
          </IconButton>
        ) : null}
        <IconButton
          type="button"
          label="Copy share link"
          variant="outline"
          className="bg-background/95 shadow-md"
          onClick={onCopyLink}
        >
          <Link2 className="h-4 w-4" aria-hidden="true" />
        </IconButton>
        <IconButton
          type="button"
          label={downloadDisabled ? "Export unavailable" : "Export Markdown"}
          variant="outline"
          className="bg-background/95 shadow-md"
          aria-describedby={downloadDisabled ? "download-disabled-note" : undefined}
          onClick={onExport}
          disabled={downloadDisabled}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  );
}

type CommentsSectionProps = {
  commentsTotal: number;
  canAnnotate: boolean;
  annotationContent: string;
  setAnnotationContent: (value: string) => void;
  annotationSubmitting: boolean;
  annotationError: string;
  onSubmitComment: () => Promise<void>;
  commentsLoading: boolean;
  commentsAppending: boolean;
  commentsError: string;
  comments: ShareComment[];
  token: string;
  accessPassword: string;
  replyingTo: { id: string; author: string } | null;
  setReplyingTo: (value: { id: string; author: string } | null) => void;
  inlineReplyContent: string;
  setInlineReplyContent: (value: string) => void;
  notify: (message: string, variant?: "default" | "success" | "error") => void;
  guestAuthor: string;
  commentsHasMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
};

function CommentsSection(props: CommentsSectionProps) {
  return (
    <ReadingSurface as="section" className="mt-12 p-6 shadow-none md:p-10">
      <h2 className="text-xl font-semibold">Comments ({props.commentsTotal})</h2>
      {props.canAnnotate ? (
        <form
          className="mt-6 rounded-xl border border-border bg-muted/40 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void props.onSubmitComment();
          }}
        >
          <label className="mb-2 block text-sm font-medium" htmlFor="share-comment">
            Add a comment
          </label>
          <textarea
            id="share-comment"
            value={props.annotationContent}
            onChange={(event) => props.setAnnotationContent(event.target.value.slice(0, 2000))}
            className="min-h-28 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-describedby={`share-comment-count${props.annotationError ? " share-comment-error" : ""}`}
            aria-invalid={Boolean(props.annotationError)}
            maxLength={2000}
          />
          {props.annotationError ? (
            <p id="share-comment-error" role="alert" className="mt-2 text-sm text-destructive">
              {props.annotationError}
            </p>
          ) : null}
          <div className="mt-3 flex items-center justify-between gap-3">
            <span id="share-comment-count" className="text-xs text-muted-foreground">
              {props.annotationContent.length}/2000 characters
            </span>
            <Button
              type="submit"
              isLoading={props.annotationSubmitting}
              disabled={!props.annotationContent.trim()}
            >
              <Send className="mr-2 h-4 w-4" aria-hidden="true" />
              Post comment
            </Button>
          </div>
        </form>
      ) : null}

      <div className="mt-8 space-y-4">
        {props.commentsLoading && props.comments.length === 0 ? (
          <PageState compact kind="loading" title="Loading comments" />
        ) : null}
        {!props.commentsLoading && props.comments.length === 0 && !props.commentsError ? (
          <PageState
            compact
            kind="empty"
            title="No comments yet"
            description={props.canAnnotate ? "Be the first to add one." : undefined}
          />
        ) : null}
        {props.comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            token={props.token}
            accessPassword={props.accessPassword}
            canAnnotate={props.canAnnotate}
            replyingToId={props.replyingTo?.id || null}
            setReplyingTo={props.setReplyingTo}
            inlineReplyContent={props.inlineReplyContent}
            setInlineReplyContent={props.setInlineReplyContent}
            notify={props.notify}
            guestAuthor={props.guestAuthor}
          />
        ))}
        {props.commentsError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span>{props.commentsError}</span>
            <Button type="button" size="sm" variant="outline" onClick={props.onRetry}>
              Retry
            </Button>
          </div>
        ) : null}
        {props.commentsHasMore && props.comments.length > 0 ? (
          <div className="text-center">
            <Button
              type="button"
              variant="outline"
              isLoading={props.commentsAppending}
              onClick={props.onLoadMore}
            >
              Load more comments
            </Button>
          </div>
        ) : null}
      </div>
    </ReadingSurface>
  );
}

function ShareFooter() {
  return (
    <footer className="mt-16 flex w-full flex-col items-center gap-5 border-t border-border px-4 pt-10 text-center">
      <Link href="/" className="font-semibold text-foreground hover:underline">
        Micro Note
      </Link>
      <p className="text-xs text-muted-foreground">
        Published with Micro Note · {new Date().getFullYear()}
      </p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        Create your own note
      </Link>
    </footer>
  );
}
