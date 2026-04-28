import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export interface ExportDialogProps {
  onClose: () => void;
  onExport: () => void;
}

export function ExportDialog({ onClose, onExport }: ExportDialogProps) {
  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <div className="text-sm font-bold">Export Notes</div>
            <div className="text-[11px] text-muted-foreground">Export all notes as JSON zip</div>
          </div>
          <button className="text-muted-foreground hover:text-foreground" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="text-sm text-muted-foreground">
            This will export all your notes into a ZIP file containing JSON documents.
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => { onClose(); onExport(); }}>Export</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
