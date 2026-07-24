"use client";

import { ExternalLink, FileText } from "lucide-react";

import { PageState } from "@/components/ui/page-state";

import type { AssetPreviewErrorCode } from "../hooks/useAssetPreview";

const ERROR_COPY: Record<AssetPreviewErrorCode, { title: string; description: string }> = {
  not_found: {
    title: "Preview unavailable",
    description: "The file could not be found.",
  },
  unsupported: {
    title: "No preview available",
    description: "The stored file does not match a supported preview format.",
  },
  too_large: {
    title: "PDF is too large to preview safely",
    description: "Download the file to inspect it outside the preview.",
  },
  encrypted: {
    title: "Password-protected PDF cannot be previewed",
    description: "The preview does not collect or store PDF passwords.",
  },
  invalid_document: {
    title: "PDF preview unavailable",
    description: "The PDF is damaged or could not be rendered safely.",
  },
  resource_limit: {
    title: "PDF exceeds preview limits",
    description: "The document is too complex to render safely in this page.",
  },
  network: {
    title: "Preview unavailable",
    description: "The preview request could not be completed.",
  },
  invalid_response: {
    title: "Preview unavailable",
    description: "The file server returned an invalid preview response.",
  },
};

export function AssetPreviewLoading({ kind }: { kind: "pdf" | "video" | "audio" }) {
  const className = kind === "pdf"
    ? "h-[60dvh] min-h-80 max-h-[48rem]"
    : kind === "video"
      ? "aspect-video min-h-48 max-h-[60dvh]"
      : "min-h-32";
  return (
    <PageState
      compact
      kind="loading"
      title="Preparing preview…"
      className={`rounded-md border border-border bg-muted/20 ${className}`}
    />
  );
}

export function AssetPreviewFailure({
  error,
  kind,
  downloadURL,
  filename,
  onRetry,
}: {
  error: AssetPreviewErrorCode;
  kind: "pdf" | "video" | "audio";
  downloadURL: string | null;
  filename: string;
  onRetry?: () => void;
}) {
  const copy = ERROR_COPY[error];
  const heightClass = kind === "pdf"
    ? "h-[60dvh] min-h-80 max-h-[48rem]"
    : kind === "video"
      ? "aspect-video min-h-48 max-h-[60dvh]"
      : "min-h-32";
  return (
    <div className={`flex flex-col items-center justify-center rounded-md border border-border bg-muted/20 p-3 ${heightClass}`}>
      <PageState
        compact
        kind="error"
        title={copy.title}
        description={copy.description}
        actionLabel={onRetry && error !== "unsupported" ? "Retry preview" : undefined}
        onAction={onRetry && error !== "unsupported" ? onRetry : undefined}
      />
      {downloadURL ? (
        <a
          href={downloadURL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Open file
          <span className="sr-only"> {filename}</span>
        </a>
      ) : null}
    </div>
  );
}

export function AssetPreviewPlaceholder({ compact }: { compact: boolean }) {
  return (
    <div className={`flex ${compact ? "h-28" : "min-h-48 max-h-72"} w-full flex-col items-center justify-center gap-2 rounded-md border border-border bg-muted/40 text-muted-foreground`}>
      <FileText className="h-6 w-6" aria-hidden="true" />
      {!compact ? <span className="text-xs">No preview available</span> : null}
    </div>
  );
}
