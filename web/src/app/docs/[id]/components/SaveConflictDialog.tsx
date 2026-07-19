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
  serverContent: string | null;
  loading: boolean;
  error: string | null;
  onRetryLoad: () => void;
  onUseServer: () => void;
  onKeepMine: () => void;
  onDownloadMine: () => void;
};

export const SAVE_CONFLICT_DIALOG_TITLE = "This document changed elsewhere";

export function SaveConflictDialog(props: Props) {
  const [mobileVersion, setMobileVersion] = useState<"local" | "server">("local");
  const canResolve = props.serverContent !== null && !props.loading;
  return (
    <Dialog
      open={props.open}
      title={SAVE_CONFLICT_DIALOG_TITLE}
      description="Your draft is safe. Compare both versions and explicitly choose what should happen."
      variant="modal"
      size="xl"
      dismissPolicy="explicit"
    >
      <DialogHeader showClose={false} />
      {canResolve ? (
        <div className="grid shrink-0 grid-cols-2 border-b border-border p-2 md:hidden">
          <VersionTab active={mobileVersion === "local"} onClick={() => setMobileVersion("local")}>
            Your draft
          </VersionTab>
          <VersionTab active={mobileVersion === "server"} onClick={() => setMobileVersion("server")}>
            Server version
          </VersionTab>
        </div>
      ) : null}
      <DialogBody>
        {props.loading ? (
          <DialogStatus variant="loading">Loading the current server version…</DialogStatus>
        ) : props.error || props.serverContent === null ? (
          <DialogStatus variant="error">
            <p>{props.error || "Could not load the server version."}</p>
            <Button className="mt-3 h-11" variant="outline" onClick={props.onRetryLoad}>
              Retry loading server version
            </Button>
          </DialogStatus>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <ContentPanel
              label="Your draft"
              content={props.localContent}
              className={mobileVersion === "local" ? "" : "hidden md:block"}
            />
            <ContentPanel
              label="Server version"
              content={props.serverContent}
              className={mobileVersion === "server" ? "" : "hidden md:block"}
            />
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button
          variant="outline"
          className="h-11 w-full sm:mr-auto sm:w-auto"
          onClick={props.onDownloadMine}
        >
          <Download className="mr-2 h-4 w-4" aria-hidden="true" />
          Download my draft
        </Button>
        {canResolve ? (
          <>
            <Button
              variant="outline"
              className="h-11 w-full sm:w-auto"
              onClick={props.onUseServer}
            >
              Use server version
            </Button>
            <Button className="h-11 w-full sm:w-auto" onClick={props.onKeepMine}>
              Keep my draft
            </Button>
          </>
        ) : null}
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
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground"
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
      <h3 className="border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
        {label}
      </h3>
      <pre className="min-h-48 overflow-x-auto whitespace-pre-wrap break-words p-3 text-xs">
        {content || "(empty document)"}
      </pre>
    </section>
  );
}
