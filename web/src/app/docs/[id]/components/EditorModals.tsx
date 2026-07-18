import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { AlertTriangle, Eye, Home, RefreshCw, X } from "lucide-react";
import MarkdownPreview from "@/components/markdown-preview";

export function DeleteConfirmDialog(props: {
  show: boolean;
  title: string;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <Dialog open={props.show} title="Delete note?" onClose={props.onClose} className="max-w-sm">
      <div className="p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="mb-2 text-lg font-bold">Delete Note?</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          This action cannot be undone. All versions of{" "}
          <span className="font-mono font-bold text-foreground">&ldquo;{props.title || "Untitled"}&rdquo;</span>{" "}
          will be permanently removed.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={props.onClose}>Cancel</Button>
          <Button variant="destructive" className="flex-1" onClick={props.onDelete}>Delete</Button>
        </div>
      </div>
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
  return (
    <Dialog open={open} title={props.previewDoc?.title || "Document preview"} onClose={props.onClose} className="flex h-[80dvh] max-w-4xl flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-muted/10 px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Home className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold">{props.previewLoading ? "Loading…" : props.previewDoc?.title || "Untitled"}</h2>
            {!props.previewLoading && <p className="font-mono text-[10px] text-muted-foreground">PREVIEW MODE</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!props.previewLoading && (
            <Button variant="outline" size="sm" onClick={() => props.onOpenFull(props.previewDoc?.id || "")}>Open Full Note</Button>
          )}
          <Button variant="ghost" size="icon" aria-label="Close preview" onClick={props.onClose}><X className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-card/30 p-6 md:p-10">
        {props.previewLoading ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
            <RefreshCw className="h-8 w-8 animate-spin opacity-20" />
            <p className="font-mono text-xs uppercase tracking-widest">Fetching content</p>
          </div>
        ) : (
          <MarkdownPreview content={props.previewDoc?.content || ""} className="max-w-none prose-lg" enableMentionHoverPreview />
        )}
      </div>
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
    <Dialog open={props.show} title={props.title || "Preview"} onClose={props.onClose} className="flex h-[85dvh] max-w-5xl flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-muted/10 px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Eye className="h-4 w-4" /></div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold">{props.title || "Untitled"}</h2>
            <p className="font-mono text-[10px] text-muted-foreground">PREVIEW MODE</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close preview" onClick={props.onClose}><X className="h-4 w-4" /></Button>
      </div>
      <div className="flex-1 overflow-y-auto bg-card/30 p-6 md:p-10">
        <article className="w-full rounded-2xl border border-slate-200/50 bg-white shadow-[0_10px_40px_-15px_rgba(0,0,0,0.1)]">
          <div className="p-6 md:p-10 lg:p-12">
            <MarkdownPreview content={props.content} className="markdown-body h-auto overflow-visible bg-transparent p-0 text-slate-800" onTocLoaded={props.onTocLoaded} enableMentionHoverPreview />
          </div>
        </article>
      </div>
    </Dialog>
  );
}
