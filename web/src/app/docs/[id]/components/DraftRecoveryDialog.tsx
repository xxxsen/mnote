"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogStatus,
} from "@/components/ui/dialog";

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
  const [mobileVersion, setMobileVersion] = useState<"local" | "server">("local");
  return (
    <Dialog
      open={open}
      title="A local draft needs your decision"
      description="The server changed after this draft was created. Nothing is overwritten until you choose."
      variant="modal"
      size="xl"
      dismissPolicy="explicit"
    >
      <DialogHeader showClose={false} />
      <div className="grid shrink-0 grid-cols-2 border-b border-slate-200 p-2 md:hidden">
        <VersionTab active={mobileVersion === "local"} onClick={() => setMobileVersion("local")}>
          Local draft
        </VersionTab>
        <VersionTab active={mobileVersion === "server"} onClick={() => setMobileVersion("server")}>
          Server version
        </VersionTab>
      </div>
      <DialogBody className="space-y-4">
        <DialogStatus variant="info">
          Choose the server version to discard the local draft, or recover the local draft into the editor.
        </DialogStatus>
        <div className="grid gap-3 md:grid-cols-2">
          <ContentPanel
            label="Local draft"
            content={localContent}
            className={mobileVersion === "local" ? "" : "hidden md:block"}
          />
          <ContentPanel
            label="Server version"
            content={serverContent}
            className={mobileVersion === "server" ? "" : "hidden md:block"}
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button
          variant="outline"
          className="h-11 w-full sm:mr-auto sm:w-auto"
          onClick={onDownloadLocal}
        >
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          Download local draft
        </Button>
        <Button
          variant="outline"
          className="h-11 w-full sm:w-auto"
          onClick={onUseServer}
        >
          Use server version
        </Button>
        <Button className="h-11 w-full sm:w-auto" onClick={onRecoverLocal}>
          Recover local draft
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function VersionTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`h-11 rounded-xl text-sm font-medium ${
        active ? "bg-slate-900 text-white" : "text-slate-600"
      }`}
    >
      {children}
    </button>
  );
}

function ContentPanel({
  label,
  content,
  className,
}: {
  label: string;
  content: string;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-xl border border-border ${className || ""}`}>
      <h3 className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>
      <pre className="min-h-40 overflow-x-auto whitespace-pre-wrap break-words p-3 text-xs">
        {content || "(empty document)"}
      </pre>
    </section>
  );
}
