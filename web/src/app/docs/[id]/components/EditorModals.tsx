import { Button } from "@/components/ui/button";
import { AlertTriangle, Home, Eye, RefreshCw, X } from "lucide-react";
import MarkdownPreview from "@/components/markdown-preview";

type DeleteConfirmDialogProps = {
  show: boolean;
  title: string;
  onClose: () => void;
  onDelete: () => void;
};

export function DeleteConfirmDialog({ show, title, onClose, onDelete }: DeleteConfirmDialogProps) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-background border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-6 text-center">
          <div className="w-12 h-12 bg-destructive/10 text-destructive rounded-full flex items-center justify-center mx-auto mb-4"><AlertTriangle className="h-6 w-6" /></div>
          <h3 className="text-lg font-bold mb-2">Delete Note?</h3>
          <p className="text-sm text-muted-foreground mb-6">This action cannot be undone. All versions of <span className="font-mono font-bold text-foreground">&ldquo;{title || "Untitled"}&rdquo;</span> will be permanently removed.</p>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>Cancel</Button>
            <Button variant="destructive" className="flex-1 rounded-xl font-bold" onClick={onDelete}>Delete</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

type DocPreviewModalProps = {
  previewDoc: { id: string; title: string; content: string } | null;
  previewLoading: boolean;
  onClose: () => void;
  onOpenFull: (id: string) => void;
};

export function DocPreviewModal({ previewDoc, previewLoading, onClose, onOpenFull }: DocPreviewModalProps) {
  if (!previewDoc && !previewLoading) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-12">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl h-[80vh] bg-background border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/10">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Home className="h-5 w-5" /></div>
            <div>
              <h3 className="text-sm font-bold truncate max-w-[200px] md:max-w-md">{previewLoading ? "Loading..." : previewDoc?.title || "Untitled"}</h3>
              {!previewLoading && <p className="text-[10px] text-muted-foreground font-mono">PREVIEW MODE</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!previewLoading && <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={() => onOpenFull(previewDoc?.id || "")}>Open Full Note</Button>}
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center hover:bg-muted rounded-full transition-colors" title="Close"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 md:p-10 no-scrollbar bg-card/30">
          {previewLoading ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-muted-foreground"><RefreshCw className="h-8 w-8 animate-spin opacity-20" /><p className="text-xs font-mono tracking-widest uppercase">Fetching content</p></div>
          ) : (
            <MarkdownPreview content={previewDoc?.content || ""} className="max-w-none prose-lg" enableMentionHoverPreview />
          )}
        </div>
      </div>
    </div>
  );
}

type PreviewModalProps = {
  show: boolean;
  title: string;
  content: string;
  onClose: () => void;
  onTocLoaded: (toc: string) => void;
};

export function PreviewModal({ show, title, content, onClose, onTocLoaded }: PreviewModalProps) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[190] flex items-center justify-center p-4 md:p-10">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-5xl h-[85vh] bg-background border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/10">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Eye className="h-4 w-4" /></div>
            <div>
              <h3 className="text-sm font-bold truncate max-w-[200px] md:max-w-md">{title || "Untitled"}</h3>
              <p className="text-[10px] text-muted-foreground font-mono">PREVIEW MODE</p>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center hover:bg-muted rounded-full transition-colors" title="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 md:p-10 no-scrollbar bg-card/30">
          <article className="w-full bg-white rounded-2xl shadow-[0_10px_40px_-15px_rgba(0,0,0,0.1)] border border-slate-200/50 relative overflow-visible">
            <div className="p-6 md:p-10 lg:p-12">
              <MarkdownPreview content={content} className="markdown-body h-auto overflow-visible p-0 bg-transparent text-slate-800" onTocLoaded={onTocLoaded} enableMentionHoverPreview />
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
