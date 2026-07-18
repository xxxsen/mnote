import { useCallback, useRef } from "react";
import { EditorView } from "@codemirror/view";

export type SourceMarker = { sourceLine: number; offsetTop: number };

export function interpolatePreviewOffset(markers: SourceMarker[], line: number): number | null {
  if (markers.length === 0) return null;
  let previous: SourceMarker | null = null;
  let next: SourceMarker | null = null;
  for (const marker of markers) {
    if (marker.sourceLine <= line) previous = marker;
    if (marker.sourceLine >= line) {
      next = marker;
      break;
    }
  }
  if (!previous) return next?.offsetTop ?? null;
  if (!next) return previous.offsetTop;
  if (next.sourceLine === previous.sourceLine) return previous.offsetTop;
  const ratio = (line - previous.sourceLine) / (next.sourceLine - previous.sourceLine);
  return previous.offsetTop + ratio * (next.offsetTop - previous.offsetTop);
}

export function nearestSourceLine(markers: SourceMarker[], scrollTop: number): number | null {
  if (markers.length === 0) return null;
  let nearest = markers[0];
  let distance = Math.abs(nearest.offsetTop - scrollTop);
  for (const marker of markers.slice(1)) {
    const nextDistance = Math.abs(marker.offsetTop - scrollTop);
    if (nextDistance < distance) {
      nearest = marker;
      distance = nextDistance;
    }
  }
  return nearest.sourceLine;
}

function readMarkers(container: HTMLElement): SourceMarker[] {
  return Array.from(container.querySelectorAll<HTMLElement>("[data-source-line]"))
    .map((element) => ({
      sourceLine: Number(element.dataset.sourceLine),
      offsetTop: element.offsetTop,
    }))
    .filter((marker) => Number.isInteger(marker.sourceLine) && marker.sourceLine > 0)
    .sort((a, b) => a.sourceLine - b.sourceLine);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function useScrollSync(opts: {
  loading: boolean;
  enabled?: boolean;
  editorViewRef: React.RefObject<EditorView | null>;
}) {
  const { loading, enabled = true, editorViewRef } = opts;
  const previewRef = useRef<HTMLDivElement>(null);
  const scrollingSource = useRef<"editor" | "preview" | null>(null);
  const scrollSyncTimerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const suppressionRef = useRef(false);

  const releaseOnNextFrame = useCallback(() => {
    window.requestAnimationFrame(() => {
      scrollingSource.current = null;
      suppressionRef.current = false;
    });
  }, []);

  const schedule = useCallback((work: () => void) => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      work();
    });
    scrollSyncTimerRef.current = frameRef.current;
  }, []);

  const handleEditorScroll = useCallback(() => {
    if (!enabled || scrollingSource.current === "preview" || loading || suppressionRef.current) return;
    schedule(() => {
      const view = editorViewRef.current;
      const preview = previewRef.current;
      if (!view || !preview) return;
      const editorMax = view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight;
      const previewMax = Math.max(0, preview.scrollHeight - preview.clientHeight);
      if (editorMax <= 0) return;
      const topBlock = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
      const visibleLine = view.state.doc.lineAt(topBlock.from).number;
      const markerTarget = interpolatePreviewOffset(readMarkers(preview), visibleLine);
      const fallback = (view.scrollDOM.scrollTop / editorMax) * previewMax;
      scrollingSource.current = "editor";
      preview.scrollTop = clamp(markerTarget ?? fallback, 0, previewMax);
      releaseOnNextFrame();
    });
  }, [editorViewRef, enabled, loading, releaseOnNextFrame, schedule]);

  const handlePreviewScroll = useCallback(() => {
    if (!enabled || scrollingSource.current === "editor" || loading || suppressionRef.current) return;
    schedule(() => {
      const view = editorViewRef.current;
      const preview = previewRef.current;
      if (!view || !preview) return;
      const markers = readMarkers(preview);
      const sourceLine = nearestSourceLine(markers, preview.scrollTop);
      scrollingSource.current = "preview";
      if (sourceLine !== null && sourceLine <= view.state.doc.lines) {
        const position = view.state.doc.line(sourceLine).from;
        view.dispatch({ effects: EditorView.scrollIntoView(position, { y: "start" }) });
      } else {
        const previewMax = preview.scrollHeight - preview.clientHeight;
        const editorMax = view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight;
        if (previewMax > 0) view.scrollDOM.scrollTop = (preview.scrollTop / previewMax) * editorMax;
      }
      releaseOnNextFrame();
    });
  }, [editorViewRef, enabled, loading, releaseOnNextFrame, schedule]);

  const suppressNextSync = useCallback(() => {
    suppressionRef.current = true;
    return () => { suppressionRef.current = false; };
  }, []);

  return {
    previewRef,
    scrollingSource,
    scrollSyncTimerRef,
    suppressNextSync,
    handleEditorScroll,
    handlePreviewScroll,
  };
}
