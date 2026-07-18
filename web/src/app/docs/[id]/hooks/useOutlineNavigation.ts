import { useCallback, useEffect, useRef, type RefObject } from "react";
import { EditorView } from "@codemirror/view";

type NavigationRefs = {
  editorViewRef: RefObject<EditorView | null>;
  previewRef: RefObject<HTMLDivElement | null>;
  suppressionRef: RefObject<boolean>;
  scrollingSource: RefObject<"editor" | "preview" | null>;
};

type UseOutlineNavigationOptions = NavigationRefs & {
  updateActiveTocId: (id: string | null) => void;
  handleEditorScroll: () => void;
  handlePreviewScroll: () => void;
  releaseAfterSettledFrames: () => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function reducedMotionPreferred(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function useOutlineNavigation(options: UseOutlineNavigationOptions) {
  const {
    editorViewRef,
    previewRef,
    suppressionRef,
    scrollingSource,
    updateActiveTocId,
    handleEditorScroll,
    handlePreviewScroll,
    releaseAfterSettledFrames,
  } = options;
  const navigationFrameRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (navigationFrameRef.current !== null) {
        window.cancelAnimationFrame(navigationFrameRef.current);
      }
    },
    [],
  );

  const scrollEditorToSourceLine = useCallback(
    (sourceLine: number, id: string): boolean => {
      const view = editorViewRef.current;
      if (
        !view ||
        !Number.isInteger(sourceLine) ||
        sourceLine < 1 ||
        sourceLine > view.state.doc.lines
      ) {
        return false;
      }
      if (navigationFrameRef.current !== null) {
        window.cancelAnimationFrame(navigationFrameRef.current);
      }
      suppressionRef.current = true;
      updateActiveTocId(id);
      view.dispatch({
        effects: EditorView.scrollIntoView(
          view.state.doc.line(sourceLine).from,
          { y: "start" },
        ),
      });
      releaseAfterSettledFrames();
      navigationFrameRef.current = window.requestAnimationFrame(() => {
        navigationFrameRef.current = window.requestAnimationFrame(() => {
          navigationFrameRef.current = null;
          handleEditorScroll();
        });
      });
      return true;
    },
    [
      editorViewRef,
      handleEditorScroll,
      releaseAfterSettledFrames,
      suppressionRef,
      updateActiveTocId,
    ],
  );

  const scrollPreviewToHeading = useCallback(
    (id: string): boolean => {
      const preview = previewRef.current;
      if (!preview) return false;
      const heading = Array.from(
        preview.querySelectorAll<HTMLElement>(
          "h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]",
        ),
      ).find((candidate) => candidate.id === id);
      if (!heading) return false;
      if (navigationFrameRef.current !== null) {
        window.cancelAnimationFrame(navigationFrameRef.current);
      }
      suppressionRef.current = true;
      updateActiveTocId(id);
      const maxScrollTop = Math.max(
        0,
        preview.scrollHeight - preview.clientHeight,
      );
      const target = clamp(
        heading.getBoundingClientRect().top -
          preview.getBoundingClientRect().top +
          preview.scrollTop,
        0,
        maxScrollTop,
      );
      const behavior = reducedMotionPreferred() ? "auto" : "smooth";
      const finish = () => {
        navigationFrameRef.current = null;
        suppressionRef.current = false;
        scrollingSource.current = null;
        handlePreviewScroll();
      };

      if (typeof preview.scrollTo === "function") {
        preview.scrollTo({ top: target, behavior });
      } else {
        preview.scrollTop = target;
      }
      if (behavior === "auto" || maxScrollTop <= 1) {
        navigationFrameRef.current = window.requestAnimationFrame(finish);
        return true;
      }

      let stableFrames = 0;
      let observedFrames = 0;
      const checkSettled = () => {
        observedFrames += 1;
        stableFrames =
          Math.abs(preview.scrollTop - target) < 1 ? stableFrames + 1 : 0;
        if (stableFrames >= 2 || observedFrames >= 90) {
          finish();
          return;
        }
        navigationFrameRef.current = window.requestAnimationFrame(checkSettled);
      };
      navigationFrameRef.current = window.requestAnimationFrame(checkSettled);
      return true;
    },
    [
      handlePreviewScroll,
      previewRef,
      scrollingSource,
      suppressionRef,
      updateActiveTocId,
    ],
  );

  return { scrollEditorToSourceLine, scrollPreviewToHeading };
}
