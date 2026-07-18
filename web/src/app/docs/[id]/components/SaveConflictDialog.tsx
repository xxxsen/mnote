"use client";

import { Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

type Props = {
  open: boolean;
  localContent: string;
  serverContent: string | null;
  loading: boolean;
  error: string | null;
  onRetryLoad: () => void;
  onUseServer: () => void;
  onKeepMine: () => void;
  onDownloadMine: () => void;
};

export function SaveConflictDialog(props: Props) {
  return (
    <Dialog
      open={props.open}
      title="Resolve save conflict"
      description="The server contains a newer document revision."
      closeOnBackdrop={false}
      closeOnEscape={false}
      className="max-w-6xl"
    >
      <div className="border-b border-border p-5">
        <h2 className="text-lg font-semibold">This document changed elsewhere</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your draft is safe. Compare both versions and explicitly choose what should happen.
        </p>
      </div>
      <div className="p-5">
        {props.loading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />Loading server version…
          </div>
        ) : props.error || props.serverContent === null ? (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p>{props.error || "Could not load the server version."}</p>
            <Button className="mt-3" variant="outline" onClick={props.onRetryLoad}>
              Retry loading server version
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <ContentPanel label="Your draft" content={props.localContent} />
            <ContentPanel label="Server version" content={props.serverContent} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border p-4">
        <Button variant="outline" onClick={props.onDownloadMine}>
          <Download className="mr-2 h-4 w-4" />Download my draft
        </Button>
        {props.serverContent !== null && !props.loading && (
          <>
            <Button variant="outline" onClick={props.onUseServer}>Use server version</Button>
            <Button onClick={props.onKeepMine}>Keep my draft</Button>
          </>
        )}
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
      <pre className="max-h-[50dvh] min-h-48 overflow-auto whitespace-pre-wrap break-words p-3 text-xs">
        {content || "(empty document)"}
      </pre>
    </section>
  );
}
