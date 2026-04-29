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
    <header className="w-full mb-3 flex flex-col px-4 md:px-0">
      <div className="flex items-center gap-2 text-indigo-600 font-mono text-xs mb-4 font-bold uppercase tracking-wider">
        <span>Public Note</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-muted-foreground">{doc.id.slice(0, 8)}</span>
      </div>
      <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-slate-900 mb-8 leading-tight">{doc.title}</h1>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 text-sm text-slate-500 border-y border-slate-200/60 py-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full border border-slate-200 overflow-hidden shrink-0">
            <img src={generatePixelAvatar(detail.author)} alt="Author" className="w-full h-full object-cover" style={{ imageRendering: "pixelated" }} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-slate-900 font-bold leading-normal mb-0.5 truncate whitespace-nowrap">{detail.author}</span>
            <span className="text-[10px] text-slate-400 font-mono uppercase tracking-tight leading-normal">Verified Creator</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-6 md:justify-end">
          <div className="flex items-center gap-2 whitespace-nowrap"><Clock className="h-4 w-4 opacity-70" /><span>{formatDate(doc.mtime)}</span></div>
          <div className="flex items-center gap-2 whitespace-nowrap"><User className="h-4 w-4 opacity-70" /><span>{readingTime} min read</span></div>
          <div
            className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border whitespace-nowrap ${canAnnotate ? "bg-cyan-50 text-cyan-700 border-cyan-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}
            title={permissionHint} aria-label={permissionHint}
          >
            {canAnnotate ? <PencilLine className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            <span>{permissionLabel}</span>
          </div>
          {detail.expires_at > 0 && (
            <div className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">Expires {formatDate(detail.expires_at)}</div>
          )}
        </div>
      </div>
      {detail.tags.length > 0 && (
        <div className="mt-3 flex h-8 items-center gap-2">
          <TagIcon className="h-4 w-4 opacity-70 shrink-0" />
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {detail.tags.map(tag => (
              <span key={tag.id} className="inline-flex h-6 items-center px-2.5 rounded-full text-xs leading-none font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 whitespace-nowrap">
                #{tag.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
