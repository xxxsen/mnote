import { useCallback, useRef } from "react";
import type { EditorView } from "@codemirror/view";

export function useScrollSync(opts: {
  loading: boolean;
  editorViewRef: React.RefObject<EditorView | null>;
}) {
  const { loading, editorViewRef } = opts;
  const previewRef = useRef<HTMLDivElement>(null);
  const scrollingSource = useRef<"editor" | "preview" | null>(null);
  const scrollSyncTimerRef = useRef<number | null>(null);
  const forcePreviewSyncRef = useRef(false);

  // TODO: extract percentage/threshold math into pure testable functions
  /* v8 ignore start -- scroll sync requires real DOM viewport measurements */
  const handleEditorScroll = useCallback(() => {
    if (scrollingSource.current === "preview" || loading) return;
    const view = editorViewRef.current;
    const preview = previewRef.current;
    if (!view || !preview) return;

    const scrollInfo = view.scrollDOM;
    const maxScroll = scrollInfo.scrollHeight - scrollInfo.clientHeight;
    if (maxScroll <= 0) return;

    const percentage = scrollInfo.scrollTop / maxScroll;
    const targetTop = percentage * (preview.scrollHeight - preview.clientHeight);

    if (Math.abs(preview.scrollTop - targetTop) > 5) {
      scrollingSource.current = "editor";
      preview.scrollTop = targetTop;

      if (scrollSyncTimerRef.current) window.clearTimeout(scrollSyncTimerRef.current);
      scrollSyncTimerRef.current = window.setTimeout(() => {
        scrollingSource.current = null;
      }, 100);
    }
  }, [loading, editorViewRef]);

  const handlePreviewScroll = useCallback(() => {
    if (scrollingSource.current === "editor" || loading) return;
    const view = editorViewRef.current;
    const preview = previewRef.current;
    if (!view || !preview) return;

    const maxScroll = preview.scrollHeight - preview.clientHeight;
    if (maxScroll <= 0) return;

    const percentage = preview.scrollTop / maxScroll;
    const scrollInfo = view.scrollDOM;
    const targetTop = percentage * (scrollInfo.scrollHeight - scrollInfo.clientHeight);

    if (Math.abs(scrollInfo.scrollTop - targetTop) > 5) {
      scrollingSource.current = "preview";
      scrollInfo.scrollTop = targetTop;

      if (scrollSyncTimerRef.current) window.clearTimeout(scrollSyncTimerRef.current);
      scrollSyncTimerRef.current = window.setTimeout(() => {
        scrollingSource.current = null;
        forcePreviewSyncRef.current = false;
      }, 100);
    }
  }, [loading, editorViewRef]);
  /* v8 ignore stop */

  return {
    previewRef,
    scrollingSource,
    scrollSyncTimerRef,
    forcePreviewSyncRef,
    handleEditorScroll,
    handlePreviewScroll,
  };
}
