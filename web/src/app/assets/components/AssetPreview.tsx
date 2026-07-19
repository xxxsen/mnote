"use client";

import { FileText, ImageOff, Music2, Video } from "lucide-react";
import { useState } from "react";

import type { Asset } from "@/types";

import { resolveAssetURL } from "../helpers";

export function AssetPreview({
  asset,
  compact = false,
}: {
  asset: Asset;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const url = resolveAssetURL(asset.url);
  const heightClass = compact ? "h-28" : "min-h-48 max-h-72";

  if (asset.content_type.startsWith("image/") && !failed) {
    return (
      <img
        src={url}
        alt={asset.name}
        className={`${heightClass} w-full rounded-md bg-muted object-contain`}
        onError={() => setFailed(true)}
      />
    );
  }
  if (asset.content_type.startsWith("video/") && !compact) {
    return <video src={url} controls className={`${heightClass} w-full rounded-md bg-muted`} />;
  }
  if (asset.content_type.startsWith("audio/") && !compact) {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-md border border-border bg-muted/40 p-4">
        <audio src={url} controls className="w-full" />
      </div>
    );
  }

  const Icon = failed
    ? ImageOff
    : asset.content_type.startsWith("video/")
      ? Video
      : asset.content_type.startsWith("audio/")
        ? Music2
        : FileText;
  return (
    <div className={`flex ${heightClass} w-full flex-col items-center justify-center gap-2 rounded-md border border-border bg-muted/40 text-muted-foreground`}>
      <Icon className="h-6 w-6" aria-hidden="true" />
      {!compact ? <span className="text-xs">{failed ? "Preview unavailable" : "No preview available"}</span> : null}
    </div>
  );
}
