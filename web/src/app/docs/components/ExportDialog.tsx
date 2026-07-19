import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogStatus,
} from "@/components/ui/dialog";
import { FileArchive } from "lucide-react";

export interface ExportDialogProps {
  open: boolean;
  exporting: boolean;
  error: string | null;
  onClose: () => void;
  onExport: () => void;
}

export function ExportDialog({
  open,
  exporting,
  error,
  onClose,
  onExport,
}: ExportDialogProps) {
  return (
    <Dialog
      open={open}
      title="Export notes"
      description="Download all notes as a ZIP archive containing JSON documents."
      variant="modal"
      size="md"
      dismissPolicy="always"
      onClose={onClose}
    >
      <DialogHeader />
      <DialogBody className="space-y-4">
        {error ? (
          <DialogStatus variant="error">
            <div>{error}</div>
            <div className="mt-1 text-xs">Check the connection and try exporting again.</div>
          </DialogStatus>
        ) : null}
        {exporting ? (
          <DialogStatus variant="loading">
            Preparing your archive. The download will start automatically.
          </DialogStatus>
        ) : (
          <div
            aria-label="Selected export format"
            className="flex items-center gap-3 rounded-xl border border-primary bg-primary/5 p-4"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <FileArchive className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="text-sm font-semibold">Micro Note JSON ZIP</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">
                Includes note content, summaries, and tag references in a portable archive.
              </div>
            </div>
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button
          variant="outline"
          className="h-11 w-full sm:w-auto"
          onClick={onClose}
        >
          {exporting ? "Cancel export" : "Cancel"}
        </Button>
        <Button
          className="h-11 w-full sm:w-auto"
          onClick={onExport}
          isLoading={exporting}
        >
          {exporting ? "Preparing export" : "Export"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
