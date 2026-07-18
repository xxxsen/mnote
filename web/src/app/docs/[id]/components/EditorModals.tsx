import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogStatus,
} from "@/components/ui/dialog";
import { AlertTriangle, Eye, Home } from "lucide-react";
import MarkdownPreview from "@/components/markdown-preview";

export function DeleteConfirmDialog(props: {
  show: boolean;
  title: string;
  onClose: () => void;
  onDelete: () => void | Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const actionRef = useRef(false);
  const remove = async () => {
    if (actionRef.current) return;
    actionRef.current = true;
    setDeleting(true);
    try {
      await props.onDelete();
    } finally {
      actionRef.current = false;
      setDeleting(false);
    }
  };
  return (
    <Dialog
      open={props.show}
      title="Delete note?"
      description={`All versions of “${props.title || "Untitled"}” will be permanently removed.`}
      variant="modal"
      size="sm"
      role="alertdialog"
      dismissPolicy="when-idle"
      busy={deleting}
      onClose={props.onClose}
    >
      <DialogHeader />
      <DialogBody className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <DialogStatus variant="error" className="text-left">
          This action cannot be undone. Shared links and version history for this note will stop working.
        </DialogStatus>
      </DialogBody>
      <DialogFooter>
        <Button
          variant="outline"
          className="h-11 w-full sm:w-auto"
          onClick={props.onClose}
          disabled={deleting}
        >
          Cancel
        </Button>
        <Button
          variant="destructive"
          className="h-11 w-full sm:w-auto"
          onClick={() => void remove()}
          isLoading={deleting}
        >
          {deleting ? "Deleting note" : "Delete note"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

export function DocPreviewModal(props: {
  previewDoc: { id: string; title: string; content: string } | null;
  previewLoading: boolean;
  onClose: () => void;
  onOpenFull: (id: string) => void;
}) {
  const open = Boolean(props.previewDoc) || props.previewLoading;
  const title = props.previewLoading ? "Loading note preview" : props.previewDoc?.title || "Document preview";
  return (
    <Dialog
      open={open}
      title={title}
      description="Read the note without leaving the current editor."
      variant="fullscreen"
      size="xl"
      onClose={props.onClose}
    >
      <DialogHeader>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Home className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-950">{title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">Preview mode</p>
          </div>
        </div>
      </DialogHeader>
      <DialogBody className="bg-slate-50 p-6 md:p-10">
        {props.previewLoading ? (
          <DialogStatus variant="loading">Fetching note content…</DialogStatus>
        ) : (
          <MarkdownPreview
            content={props.previewDoc?.content || ""}
            className="mx-auto max-w-4xl prose-lg"
            enableMentionHoverPreview
          />
        )}
      </DialogBody>
      <DialogFooter>
        <Button
          variant="outline"
          className="h-11 w-full sm:w-auto"
          onClick={props.onClose}
        >
          Close
        </Button>
        {!props.previewLoading ? (
          <Button
            className="h-11 w-full sm:w-auto"
            onClick={() => props.onOpenFull(props.previewDoc?.id || "")}
          >
            Open full note
          </Button>
        ) : null}
      </DialogFooter>
    </Dialog>
  );
}

export function PreviewModal(props: {
  show: boolean;
  title: string;
  content: string;
  onClose: () => void;
  onTocLoaded: (toc: string) => void;
}) {
  return (
    <Dialog
      open={props.show}
      title={props.title || "Preview"}
      description="Full rendered preview of the current Markdown note."
      variant="fullscreen"
      size="xl"
      onClose={props.onClose}
    >
      <DialogHeader>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Eye className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-950">
              {props.title || "Untitled"}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">Full preview</p>
          </div>
        </div>
      </DialogHeader>
      <DialogBody className="bg-slate-50 p-4 sm:p-6 md:p-10">
        <article className="mx-auto w-full max-w-5xl rounded-2xl border border-slate-200/50 bg-white shadow-[0_10px_40px_-15px_rgba(0,0,0,0.1)]">
          <div className="p-5 sm:p-6 md:p-10 lg:p-12">
            <MarkdownPreview
              content={props.content}
              className="markdown-body h-auto overflow-visible bg-transparent p-0 text-slate-800"
              onTocLoaded={props.onTocLoaded}
              enableMentionHoverPreview
            />
          </div>
        </article>
      </DialogBody>
      <DialogFooter>
        <Button className="h-11 w-full sm:w-auto" onClick={props.onClose}>Close preview</Button>
      </DialogFooter>
    </Dialog>
  );
}
