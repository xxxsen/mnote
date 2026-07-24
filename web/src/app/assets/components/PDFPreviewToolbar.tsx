"use client";

import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  PDF_PREVIEW_MAX_ZOOM,
  PDF_PREVIEW_MIN_ZOOM,
} from "../helpers";

export function PDFPreviewToolbar({
  page,
  pages,
  zoom,
  onPrevious,
  onNext,
  onZoomOut,
  onZoomIn,
}: {
  page: number;
  pages: number;
  zoom: number;
  onPrevious: () => void;
  onNext: () => void;
  onZoomOut: () => void;
  onZoomIn: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="PDF preview controls"
      className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-border bg-background/95 px-2 py-1.5"
    >
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Previous PDF page"
          disabled={page <= 1}
          onClick={onPrevious}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <span
          aria-live="polite"
          className="min-w-24 text-center text-xs tabular-nums text-muted-foreground"
        >
          Page {page} of {pages}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Next PDF page"
          disabled={page >= pages}
          onClick={onNext}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Zoom out PDF"
          disabled={zoom <= PDF_PREVIEW_MIN_ZOOM}
          onClick={onZoomOut}
        >
          <ZoomOut className="h-4 w-4" aria-hidden="true" />
        </Button>
        <span className="min-w-12 text-center text-xs tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Zoom in PDF"
          disabled={zoom >= PDF_PREVIEW_MAX_ZOOM}
          onClick={onZoomIn}
        >
          <ZoomIn className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
