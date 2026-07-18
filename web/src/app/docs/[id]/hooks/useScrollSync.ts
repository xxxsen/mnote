import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorView } from "@codemirror/view";
import { buildOutline } from "@/components/markdown-preview/helpers";
import type { OutlineEntry } from "@/components/markdown-preview/types";
import { useOutlineNavigation } from "./useOutlineNavigation";

export type SourceMarker = { sourceLine: number; offsetTop: number };
export type TocHeadingMarker = Pick<OutlineEntry, "sourceLine" | "id">;

export function interpolatePreviewOffset(
  markers: SourceMarker[],
  line: number,
): number | null {
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
  const ratio =
    (line - previous.sourceLine) / (next.sourceLine - previous.sourceLine);
  return previous.offsetTop + ratio * (next.offsetTop - previous.offsetTop);
}

export function nearestSourceLine(
  markers: SourceMarker[],
  scrollTop: number,
): number | null {
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

export function buildTocHeadingMarkers(content: string): TocHeadingMarker[] {
  return buildOutline(content).map(({ sourceLine, id }) => ({
    sourceLine,
    id,
  }));
}

export function activeHeadingForSourceLine(
  headings: TocHeadingMarker[],
  sourceLine: number,
): string | null {
  if (headings.length === 0) return null;
  let active = headings[0].id;
  for (const heading of headings) {
    if (heading.sourceLine > sourceLine) break;
    active = heading.id;
  }
  return active;
}

export function activeHeadingForPreview(container: HTMLElement): string | null {
  const headings = Array.from(
    container.querySelectorAll<HTMLElement>(
      "h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]",
    ),
  ).filter((heading) => heading.id);
  if (headings.length === 0) return null;
  const atBottom =
    container.scrollHeight > container.clientHeight + 1 &&
    container.scrollTop + container.clientHeight >= container.scrollHeight - 2;
  if (atBottom) return headings[headings.length - 1].id;

  const activationY =
    container.getBoundingClientRect().top +
    Math.min(96, Math.max(32, container.clientHeight * 0.2));
  let activeIndex = 0;
  let low = 0;
  let high = headings.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (headings[middle].getBoundingClientRect().top <= activationY) {
      activeIndex = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return headings[activeIndex].id;
}

function readMarkers(container: HTMLElement): SourceMarker[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>("[data-source-line]"),
  )
    .map((element) => ({
      sourceLine: Number(element.dataset.sourceLine),
      offsetTop: element.offsetTop,
    }))
    .filter(
      (marker) => Number.isInteger(marker.sourceLine) && marker.sourceLine > 0,
    )
    .sort((a, b) => a.sourceLine - b.sourceLine);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function useScrollSync(opts: {
  loading: boolean;
  enabled?: boolean;
  content?: string;
  outline?: readonly OutlineEntry[];
  scopeKey?: string;
  editorViewRef: React.RefObject<EditorView | null>;
}) {
  const {
    loading,
    enabled = true,
    content = "",
    outline,
    scopeKey = "",
    editorViewRef,
  } = opts;
  const previewRef = useRef<HTMLDivElement>(null);
  const scrollingSource = useRef<"editor" | "preview" | null>(null);
  const scrollSyncTimerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const releaseFrameRef = useRef<number | null>(null);
  const suppressionRef = useRef(false);
  const headingMarkers = useMemo(
    () =>
      (outline ?? buildOutline(content)).map(({ sourceLine, id }) => ({
        sourceLine,
        id,
      })),
    [content, outline],
  );
  const headingMarkersRef = useRef(headingMarkers);
  const enabledRef = useRef(enabled);
  const loadingRef = useRef(loading);
  const scopeKeyRef = useRef(scopeKey);
  const [activeTocObservation, setActiveTocObservation] = useState({
    scopeKey,
    id: null as string | null,
  });

  useEffect(() => {
    headingMarkersRef.current = headingMarkers;
    enabledRef.current = enabled;
    loadingRef.current = loading;
    scopeKeyRef.current = scopeKey;
  }, [enabled, headingMarkers, loading, scopeKey]);
  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      if (releaseFrameRef.current !== null) {
        window.cancelAnimationFrame(releaseFrameRef.current);
      }
    },
    [],
  );

  const activeTocId =
    activeTocObservation.scopeKey === scopeKey &&
    headingMarkers.some((heading) => heading.id === activeTocObservation.id)
      ? activeTocObservation.id
      : (headingMarkers[0]?.id ?? null);
  const updateActiveTocId = useCallback((id: string | null) => {
    const currentScopeKey = scopeKeyRef.current;
    setActiveTocObservation((current) =>
      current.scopeKey === currentScopeKey && current.id === id
        ? current
        : { scopeKey: currentScopeKey, id },
    );
  }, []);
  const releaseAfterSettledFrames = useCallback(() => {
    if (releaseFrameRef.current !== null) {
      window.cancelAnimationFrame(releaseFrameRef.current);
    }
    releaseFrameRef.current = window.requestAnimationFrame(() => {
      // CodeMirror applies scrollIntoView during a measured frame. Keep the
      // originating pane authoritative until its delayed scroll event fires.
      releaseFrameRef.current = window.requestAnimationFrame(() => {
        releaseFrameRef.current = null;
        scrollingSource.current = null;
        suppressionRef.current = false;
      });
    });
  }, []);
  const schedule = useCallback((work: () => void) => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      work();
    });
    scrollSyncTimerRef.current = frameRef.current;
  }, []);

  const handleEditorScroll = useCallback(() => {
    if (
      scrollingSource.current === "preview" ||
      loadingRef.current ||
      suppressionRef.current
    )
      return;
    schedule(() => {
      const view = editorViewRef.current;
      if (!view) return;
      const activationBlock = view.lineBlockAtHeight(
        view.scrollDOM.scrollTop + view.scrollDOM.clientHeight / 2,
      );
      const activationLine = view.state.doc.lineAt(activationBlock.from).number;
      updateActiveTocId(
        activeHeadingForSourceLine(headingMarkersRef.current, activationLine),
      );
      if (!enabledRef.current) return;
      const topBlock = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
      const topVisibleLine = view.state.doc.lineAt(topBlock.from).number;
      const preview = previewRef.current;
      if (!preview) return;
      const editorMax =
        view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight;
      const previewMax = Math.max(
        0,
        preview.scrollHeight - preview.clientHeight,
      );
      if (editorMax <= 0) return;
      const markerTarget = interpolatePreviewOffset(
        readMarkers(preview),
        topVisibleLine,
      );
      const fallback = (view.scrollDOM.scrollTop / editorMax) * previewMax;
      scrollingSource.current = "editor";
      preview.scrollTop = clamp(markerTarget ?? fallback, 0, previewMax);
      releaseAfterSettledFrames();
    });
  }, [editorViewRef, releaseAfterSettledFrames, schedule, updateActiveTocId]);

  const handlePreviewScroll = useCallback(() => {
    if (
      scrollingSource.current === "editor" ||
      loadingRef.current ||
      suppressionRef.current
    )
      return;
    schedule(() => {
      const preview = previewRef.current;
      if (!preview) return;
      updateActiveTocId(activeHeadingForPreview(preview));
      if (!enabledRef.current) return;
      const view = editorViewRef.current;
      if (!view) return;
      const sourceLine = nearestSourceLine(
        readMarkers(preview),
        preview.scrollTop,
      );
      scrollingSource.current = "preview";
      if (sourceLine !== null && sourceLine <= view.state.doc.lines) {
        view.dispatch({
          effects: EditorView.scrollIntoView(
            view.state.doc.line(sourceLine).from,
            { y: "start" },
          ),
        });
      } else {
        const previewMax = preview.scrollHeight - preview.clientHeight;
        const editorMax =
          view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight;
        if (previewMax > 0) {
          view.scrollDOM.scrollTop =
            (preview.scrollTop / previewMax) * editorMax;
        }
      }
      releaseAfterSettledFrames();
    });
  }, [editorViewRef, releaseAfterSettledFrames, schedule, updateActiveTocId]);

  const navigation = useOutlineNavigation({
    editorViewRef,
    previewRef,
    suppressionRef,
    scrollingSource,
    updateActiveTocId,
    handlePreviewScroll,
    releaseAfterSettledFrames,
  });
  const suppressNextSync = useCallback(() => {
    suppressionRef.current = true;
    return () => {
      suppressionRef.current = false;
    };
  }, []);

  return {
    previewRef,
    scrollingSource,
    scrollSyncTimerRef,
    suppressNextSync,
    handleEditorScroll,
    handlePreviewScroll,
    ...navigation,
    activeTocId,
  };
}
