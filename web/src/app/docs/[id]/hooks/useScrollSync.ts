import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildOutline } from "@/components/markdown-preview/helpers";
import type { OutlineEntry } from "@/components/markdown-preview/types";
import { useOutlineNavigation } from "./useOutlineNavigation";
import type { EditorView } from "@codemirror/view";

export type SourceMarker = { sourceLine: number; offsetTop: number };
export type TocHeadingMarker = Pick<OutlineEntry, "sourceLine" | "id">;
type ViewMode = "edit" | "split" | "preview";

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

export function wheelDeltaToPixels(
  deltaY: number,
  deltaMode: number,
  pageSize: number,
): number {
  if (deltaMode === 1) return deltaY * 16;
  if (deltaMode === 2) return deltaY * pageSize;
  return deltaY;
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

function readHeadingMarkers(
  container: HTMLElement,
  headings: readonly TocHeadingMarker[],
): SourceMarker[] {
  const containerTop = container.getBoundingClientRect().top;
  const elementsByID = new Map(
    Array.from(
      container.querySelectorAll<HTMLElement>(
        "h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]",
      ),
    ).map((element) => [element.id, element]),
  );
  return headings.flatMap(({ id, sourceLine }) => {
    const element = elementsByID.get(id);
    if (!element) return [];
    return [{
      sourceLine,
      offsetTop:
        element.getBoundingClientRect().top -
        containerTop +
        container.scrollTop,
    }];
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function useEditorMasterSync(opts: {
  editorViewRef: React.RefObject<EditorView | null>;
  previewRef: React.RefObject<HTMLDivElement | null>;
  headingMarkersRef: React.RefObject<TocHeadingMarker[]>;
  loadingRef: React.RefObject<boolean>;
  enabledRef: React.RefObject<boolean>;
  viewModeRef: React.RefObject<ViewMode>;
  scrollingSource: React.RefObject<"editor" | "preview" | null>;
  updateActiveTocId: (id: string | null) => void;
  releaseAfterSettledFrames: () => void;
}) {
  const {
    editorViewRef,
    previewRef,
    headingMarkersRef,
    loadingRef,
    enabledRef,
    viewModeRef,
    scrollingSource: scrollingSourceRef,
    updateActiveTocId,
    releaseAfterSettledFrames,
  } = opts;
  return useCallback(() => {
    const view = editorViewRef.current;
    if (!view || loadingRef.current) return;
    const editor = view.scrollDOM;
    const activationBlock = view.lineBlockAtHeight(
      editor.scrollTop + editor.clientHeight / 2,
    );
    const activationLine = view.state.doc.lineAt(activationBlock.from).number;
    updateActiveTocId(
      activeHeadingForSourceLine(headingMarkersRef.current, activationLine),
    );
    if (!enabledRef.current || viewModeRef.current !== "split") return;

    const preview = previewRef.current;
    if (!preview) return;
    const previewMax = Math.max(
      0,
      preview.scrollHeight - preview.clientHeight,
    );
    const markers = readHeadingMarkers(preview, headingMarkersRef.current);
    if (
      markers.length > 0 &&
      markers[markers.length - 1].sourceLine < view.state.doc.lines
    ) {
      markers.push({
        sourceLine: view.state.doc.lines,
        offsetTop: preview.scrollHeight,
      });
    }
    const markerCenter = interpolatePreviewOffset(markers, activationLine);
    const editorCenterProgress = clamp(
      (editor.scrollTop + editor.clientHeight / 2) /
        Math.max(editor.scrollHeight, 1),
      0,
      1,
    );
    const fallbackCenter = editorCenterProgress * preview.scrollHeight;
    scrollingSourceRef.current = "editor";
    preview.scrollTop = clamp(
      (markerCenter ?? fallbackCenter) - preview.clientHeight / 2,
      0,
      previewMax,
    );
    releaseAfterSettledFrames();
  }, [
    editorViewRef,
    enabledRef,
    headingMarkersRef,
    loadingRef,
    previewRef,
    releaseAfterSettledFrames,
    scrollingSourceRef,
    updateActiveTocId,
    viewModeRef,
  ]);
}

function useDelegatedPreviewWheel(opts: {
  editorViewRef: React.RefObject<EditorView | null>;
  loadingRef: React.RefObject<boolean>;
  enabledRef: React.RefObject<boolean>;
  viewModeRef: React.RefObject<ViewMode>;
  handleEditorScroll: () => void;
}) {
  const {
    editorViewRef,
    loadingRef,
    enabledRef,
    viewModeRef,
    handleEditorScroll,
  } = opts;
  return useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (
        event.ctrlKey ||
        loadingRef.current ||
        !enabledRef.current ||
        viewModeRef.current !== "split"
      ) {
        return;
      }
      const view = editorViewRef.current;
      if (!view) return;
      const delta = wheelDeltaToPixels(
        event.deltaY,
        event.deltaMode,
        view.scrollDOM.clientHeight,
      );
      if (delta === 0) return;
      event.preventDefault();
      const editorMax = Math.max(
        0,
        view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight,
      );
      view.scrollDOM.scrollTop = clamp(
        view.scrollDOM.scrollTop + delta,
        0,
        editorMax,
      );
      handleEditorScroll();
    },
    [editorViewRef, enabledRef, handleEditorScroll, loadingRef, viewModeRef],
  );
}

export function useScrollSync(opts: {
  loading: boolean;
  enabled?: boolean;
  content?: string;
  outline?: readonly OutlineEntry[];
  scopeKey?: string;
  viewMode?: ViewMode;
  editorViewRef: React.RefObject<EditorView | null>;
}) {
  const {
    loading,
    enabled = true,
    content = "",
    outline,
    scopeKey = "",
    viewMode = "split",
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
  const viewModeRef = useRef(viewMode);
  const [activeTocObservation, setActiveTocObservation] = useState({
    scopeKey,
    id: null as string | null,
  });

  useEffect(() => {
    headingMarkersRef.current = headingMarkers;
    enabledRef.current = enabled;
    loadingRef.current = loading;
    scopeKeyRef.current = scopeKey;
    viewModeRef.current = viewMode;
  }, [enabled, headingMarkers, loading, scopeKey, viewMode]);
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

  const syncPreviewFromEditor = useEditorMasterSync({
    editorViewRef, previewRef, headingMarkersRef, loadingRef, enabledRef,
    viewModeRef, scrollingSource, updateActiveTocId,
    releaseAfterSettledFrames,
  });

  const handleEditorScroll = useCallback(() => {
    if (
      scrollingSource.current === "preview" ||
      loadingRef.current ||
      suppressionRef.current
    ) {
      return;
    }
    schedule(syncPreviewFromEditor);
  }, [schedule, syncPreviewFromEditor]);

  const handlePreviewScroll = useCallback(() => {
    if (
      scrollingSource.current === "editor" ||
      loadingRef.current ||
      suppressionRef.current
    ) {
      return;
    }
    schedule(() => {
      const preview = previewRef.current;
      if (!preview) return;
      if (enabledRef.current && viewModeRef.current === "split") {
        syncPreviewFromEditor();
        return;
      }
      updateActiveTocId(activeHeadingForPreview(preview));
    });
  }, [schedule, syncPreviewFromEditor, updateActiveTocId]);

  const handlePreviewWheel = useDelegatedPreviewWheel({
    editorViewRef, loadingRef, enabledRef, viewModeRef, handleEditorScroll,
  });

  useEffect(() => {
    if (
      loading ||
      !enabled ||
      viewMode !== "split" ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }
    const preview = previewRef.current;
    const contentRoot = preview?.querySelector<HTMLElement>(
      "[data-preview-scroll-content]",
    );
    if (!preview || !contentRoot) return;
    const observer = new ResizeObserver(() => {
      schedule(syncPreviewFromEditor);
    });
    observer.observe(contentRoot);
    schedule(syncPreviewFromEditor);
    return () => observer.disconnect();
  }, [enabled, headingMarkers, loading, schedule, scopeKey, syncPreviewFromEditor, viewMode]);

  const navigation = useOutlineNavigation({
    editorViewRef,
    previewRef,
    suppressionRef,
    scrollingSource,
    updateActiveTocId,
    handleEditorScroll,
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
    handlePreviewWheel,
    ...navigation,
    activeTocId,
  };
}
