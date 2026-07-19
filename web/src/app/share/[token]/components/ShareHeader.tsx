"use client";

import { formatDate, generatePixelAvatar } from "@/lib/utils";
import { Clock, User, Tag as TagIcon, ChevronRight, Eye, PencilLine } from "lucide-react";
import type { PublicShareDetail, Document } from "@/types";
import { estimateReadingTime } from "../utils";

export function ShareHeader({
  doc, detail, canAnnotate, permissionLabel, permissionHint,
}: {
  doc: Document; detail: PublicShareDetail; canAnnotate: boolean;
  permissionLabel: string; permissionHint: string;
}) {
  const readingTime = estimateReadingTime(doc.content);
  return (
    <header className="mb-3 flex w-full flex-col">
      <div className="mb-4 flex items-center gap-2 font-mono text-xs font-semibold text-info">
        <span>Public Note</span>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <span className="text-muted-foreground">{doc.id.slice(0, 8)}</span>
      </div>
      <h1 id="share-title" className="mb-8 break-words text-3xl font-bold leading-tight tracking-tight text-foreground md:text-5xl">
        {doc.title || "Untitled note"}
      </h1>
      <div className="flex flex-col justify-between gap-6 border-y border-border py-6 text-sm text-muted-foreground md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border">
            <img src={generatePixelAvatar(detail.author)} alt="" className="h-full w-full object-cover" style={{ imageRendering: "pixelated" }} />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="mb-0.5 truncate font-semibold leading-normal text-foreground">{detail.author}</span>
            <span className="font-mono text-xs leading-normal text-muted-foreground">Author</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 md:justify-end">
          <div className="flex items-center gap-2 whitespace-nowrap"><Clock className="h-4 w-4" aria-hidden="true" /><span>{formatDate(doc.mtime)}</span></div>
          <div className="flex items-center gap-2 whitespace-nowrap"><User className="h-4 w-4" aria-hidden="true" /><span>{readingTime} min read</span></div>
          <div
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs ${
              canAnnotate
                ? "border-info/30 bg-info/10 text-info"
                : "border-border bg-muted text-muted-foreground"
            }`}
            title={permissionHint} aria-label={permissionHint}
          >
            {canAnnotate
              ? <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
              : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>{permissionLabel}</span>
          </div>
          {detail.expires_at > 0 && (
            <div className="rounded-full border border-warning/30 bg-warning/10 px-2 py-1 text-xs text-warning">
              Expires {formatDate(detail.expires_at)}
            </div>
          )}
        </div>
      </div>
      {detail.tags.length > 0 && (
        <div className="mt-3 flex min-h-8 items-center gap-2">
          <TagIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {detail.tags.map(tag => (
              <span key={tag.id} className="inline-flex h-6 items-center whitespace-nowrap rounded-full border border-border bg-muted px-2.5 text-xs font-medium leading-none text-foreground">
                #{tag.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
