"use client";

import { FileText, ImageOff, Music2, Video } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";

import type { Asset } from "@/types";

import {
  classifyAssetPreview,
  resolveAssetDownloadURL,
  resolveAssetURL,
  type AssetPreviewKind,
} from "../helpers";
import { useAssetPreview } from "../hooks/useAssetPreview";
import { AssetPreviewFailure, AssetPreviewLoading, AssetPreviewPlaceholder } from "./AssetPreviewState";
import { PDFAssetPreview } from "./PDFAssetPreview";

export function AssetPreview({
  asset,
  compact = false,
}: {
  asset: Asset;
  compact?: boolean;
}) {
  const kind = classifyAssetPreview(asset.content_type, asset.name);
  if (compact) {
    return kind === "image"
      ? <ImageAssetPreview asset={asset} compact />
      : <CompactAssetPreview kind={kind} />;
  }
  if (kind === "image") return <ImageAssetPreview asset={asset} />;
  if (kind === "unsupported") return <AssetPreviewPlaceholder compact={false} />;
  return <InteractiveAssetPreview asset={asset} />;
}

function CompactAssetPreview({ kind }: { kind: AssetPreviewKind }) {
  const Icon = kind === "video"
    ? Video
    : kind === "audio"
      ? Music2
      : FileText;
  const label = kind === "unsupported" ? "FILE" : kind.toUpperCase();
  return (
    <div className="flex h-28 w-full flex-col items-center justify-center gap-2 rounded-md border border-border bg-muted/40 text-muted-foreground">
      <Icon className="h-6 w-6" aria-hidden="true" />
      <span className="text-[0.625rem] font-semibold tracking-wide">{label}</span>
    </div>
  );
}

function ImageAssetPreview({ asset, compact = false }: { asset: Asset; compact?: boolean }) {
  const [failed, setFailed] = useState(false);
  const url = resolveAssetURL(asset.url);
  const heightClass = compact ? "h-28" : "min-h-48 max-h-72";
  if (failed) {
    return (
      <div className={`flex ${heightClass} w-full flex-col items-center justify-center gap-2 rounded-md border border-border bg-muted/40 text-muted-foreground`}>
        <ImageOff className="h-6 w-6" aria-hidden="true" />
        {!compact ? <span className="text-xs">Preview unavailable</span> : null}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={asset.name}
      className={`${heightClass} w-full rounded-md bg-muted object-contain`}
      onError={() => setFailed(true)}
    />
  );
}

function InteractiveAssetPreview({ asset }: { asset: Asset }) {
  const preview = useAssetPreview(asset);
  const downloadURL = resolveAssetDownloadURL(asset.file_key);

  if (preview.state.status === "checking") {
    return <AssetPreviewLoading kind={preview.kind as "pdf" | "video" | "audio"} />;
  }
  if (preview.state.status === "error") {
    return (
      <AssetPreviewFailure
        error={preview.state.error}
        kind={preview.kind as "pdf" | "video" | "audio"}
        downloadURL={downloadURL}
        filename={asset.name}
        onRetry={preview.retry}
      />
    );
  }
  if (preview.state.status !== "ready" || !preview.previewURL) {
    return <AssetPreviewPlaceholder compact={false} />;
  }
  if (preview.kind === "pdf") {
    return (
      <PDFAssetPreview
        asset={asset}
        previewURL={preview.previewURL}
        downloadURL={downloadURL}
        onRetry={preview.retry}
      />
    );
  }
  if (preview.kind === "video") {
    return (
      <VideoAssetPreview
        asset={asset}
        previewURL={preview.previewURL}
        downloadURL={downloadURL}
        onRetry={preview.retry}
      />
    );
  }
  if (preview.kind === "audio") {
    return (
      <AudioAssetPreview
        asset={asset}
        previewURL={preview.previewURL}
        downloadURL={downloadURL}
        onRetry={preview.retry}
      />
    );
  }
  return <AssetPreviewPlaceholder compact={false} />;
}

function VideoAssetPreview({
  asset,
  previewURL,
  downloadURL,
  onRetry,
}: {
  asset: Asset;
  previewURL: string;
  downloadURL: string | null;
  onRetry: () => void;
}) {
  const mediaRef = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  useMediaCleanup(mediaRef);

  if (failed) {
    return (
      <AssetPreviewFailure
        error="invalid_response"
        kind="video"
        downloadURL={downloadURL}
        filename={asset.name}
        onRetry={onRetry}
      />
    );
  }
  return (
    <div className="relative aspect-video min-h-48 max-h-[60dvh] w-full overflow-hidden rounded-md bg-muted">
      {!loaded ? (
        <div className="absolute inset-0 z-10">
          <AssetPreviewLoading kind="video" />
        </div>
      ) : null}
      <video
        ref={mediaRef}
        src={previewURL}
        controls
        playsInline
        preload="metadata"
        aria-label={`Preview ${asset.name}`}
        className="aspect-video max-h-[60dvh] w-full object-contain"
        onLoadedMetadata={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function AudioAssetPreview({
  asset,
  previewURL,
  downloadURL,
  onRetry,
}: {
  asset: Asset;
  previewURL: string;
  downloadURL: string | null;
  onRetry: () => void;
}) {
  const mediaRef = useRef<HTMLAudioElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  useMediaCleanup(mediaRef);

  if (failed) {
    return (
      <AssetPreviewFailure
        error="invalid_response"
        kind="audio"
        downloadURL={downloadURL}
        filename={asset.name}
        onRetry={onRetry}
      />
    );
  }
  return (
    <div className="relative flex min-h-32 flex-col justify-center gap-3 overflow-hidden rounded-md border border-border bg-muted/40 p-4">
      {!loaded ? (
        <div className="absolute inset-0 z-10">
          <AssetPreviewLoading kind="audio" />
        </div>
      ) : null}
      <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <Music2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate">{asset.name}</span>
      </div>
      <audio
        ref={mediaRef}
        src={previewURL}
        controls
        preload="metadata"
        aria-label={`Preview ${asset.name}`}
        className="w-full"
        onLoadedMetadata={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function useMediaCleanup<T extends HTMLMediaElement>(
  ref: RefObject<T | null>,
) {
  useEffect(() => () => {
    const media = ref.current;
    if (!media) return;
    media.pause();
    media.removeAttribute("src");
    media.load();
  }, [ref]);
}
