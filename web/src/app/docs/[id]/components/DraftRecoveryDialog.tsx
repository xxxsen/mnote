"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type Props = {
  open: boolean;
  localContent: string;
  serverContent: string;
  onUseServer: () => void;
  onRecoverLocal: () => void;
  onDownloadLocal: () => void;
};

export function DraftRecoveryDialog({
  open,
  localContent,
  serverContent,
  onUseServer,
  onRecoverLocal,
  onDownloadLocal,
}: Props) {
  return (
    <Dialog
      open={open}
      title="Recover local draft"
      description="Choose which content should be loaded into the editor."
      closeOnBackdrop={false}
      closeOnEscape={false}
      className="max-w-5xl"
    >
      <div className="border-b border-border p-5">
        <h2 className="text-lg font-semibold">A local draft needs your decision</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The server changed after this draft was created. Nothing will be overwritten until you choose.
        </p>
      </div>
      <div className="grid gap-3 p-5 md:grid-cols-2">
        <ContentPanel label="Local draft" content={localContent} />
        <ContentPanel label="Server version" content={serverContent} />
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border p-4">
        <Button variant="outline" onClick={onDownloadLocal}>
          <Download className="mr-2 h-4 w-4" />Download local draft
        </Button>
        <Button variant="outline" onClick={onUseServer}>Use server version</Button>
        <Button onClick={onRecoverLocal}>Recover local draft</Button>
      </div>
    </Dialog>
  );
}

function ContentPanel({ label, content }: { label: string; content: string }) {
  return (
    <section className="min-w-0 rounded-lg border border-border">
      <h3 className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>
      <pre className="max-h-[45dvh] min-h-40 overflow-auto whitespace-pre-wrap break-words p-3 text-xs">
        {content || "(empty document)"}
      </pre>
    </section>
  );
}
