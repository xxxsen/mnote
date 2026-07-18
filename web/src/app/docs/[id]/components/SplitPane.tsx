"use client";

import {
  useCallback,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const ABSOLUTE_MIN_RATIO = 30;
const ABSOLUTE_MAX_RATIO = 70;
export const SPLIT_PANE_MIN_WIDTH = 420;
export const SPLIT_PANE_DIVIDER_WIDTH = 6;

type Props = {
  ratio: number;
  onRatioChange: (ratio: number) => void;
  left: ReactNode;
  right: ReactNode;
};

export function getSplitRatioBounds(width: number): {
  min: number;
  max: number;
} {
  if (!Number.isFinite(width) || width <= 0) {
    return { min: ABSOLUTE_MIN_RATIO, max: ABSOLUTE_MAX_RATIO };
  }
  const paneSpace = width - SPLIT_PANE_DIVIDER_WIDTH;
  if (paneSpace <= 0) return { min: 50, max: 50 };
  const dynamicMin = (SPLIT_PANE_MIN_WIDTH / paneSpace) * 100;
  const min = Math.max(ABSOLUTE_MIN_RATIO, dynamicMin);
  const max = Math.min(ABSOLUTE_MAX_RATIO, 100 - dynamicMin);
  if (min > max) return { min: 50, max: 50 };
  return { min, max };
}

export function clampSplitRatioForWidth(
  ratio: number,
  width: number,
): number {
  const bounds = getSplitRatioBounds(width);
  return Math.max(bounds.min, Math.min(bounds.max, ratio));
}

function subscribeElementWidth(
  element: HTMLDivElement | null,
  onChange: () => void,
): () => void {
  if (!element) return () => undefined;
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(onChange);
    observer.observe(element);
    return () => observer.disconnect();
  }
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function readElementWidth(element: HTMLDivElement | null): number {
  if (!element) return 0;
  return element.clientWidth || element.getBoundingClientRect().width;
}

export function SplitPane({ ratio, onRatioChange, left, right }: Props) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const subscribe = useCallback(
    (onChange: () => void) =>
      subscribeElementWidth(container, onChange),
    [container],
  );
  const getSnapshot = useCallback(
    () => readElementWidth(container),
    [container],
  );
  const width = useSyncExternalStore(subscribe, getSnapshot, () => 0);
  const bounds = getSplitRatioBounds(width);
  const effectiveRatio = clampSplitRatioForWidth(ratio, width);

  const commitRatio = useCallback(
    (next: number, measuredWidth = width) => {
      onRatioChange(clampSplitRatioForWidth(next, measuredWidth));
    },
    [onRatioChange, width],
  );

  const updateFromPointer = useCallback(
    (clientX: number) => {
      const rect = container?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const paneSpace = rect.width - SPLIT_PANE_DIVIDER_WIDTH;
      if (paneSpace <= 0) return;
      commitRatio(
        ((clientX - rect.left - SPLIT_PANE_DIVIDER_WIDTH / 2) / paneSpace) *
          100,
        rect.width,
      );
    },
    [commitRatio, container],
  );

  return (
    <div ref={setContainer} className="flex h-full min-w-0">
      <div
        className="h-full min-w-0 shrink-0"
        style={{
          flexBasis: `calc((100% - 0.375rem) * ${effectiveRatio / 100})`,
        }}
      >
        {left}
      </div>
      <div
        role="separator"
        aria-label="Resize editor and preview"
        aria-orientation="vertical"
        aria-valuemin={Number(bounds.min.toFixed(2))}
        aria-valuemax={Number(bounds.max.toFixed(2))}
        aria-valuenow={Number(effectiveRatio.toFixed(2))}
        tabIndex={0}
        className="group relative z-20 w-1.5 shrink-0 cursor-col-resize bg-border outline-none focus:bg-primary"
        onDoubleClick={() => commitRatio(50)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            commitRatio(effectiveRatio - 5);
          } else if (event.key === "ArrowRight") {
            commitRatio(effectiveRatio + 5);
          } else if (event.key === "Home") {
            commitRatio(bounds.min);
          } else if (event.key === "End") {
            commitRatio(bounds.max);
          } else {
            return;
          }
          event.preventDefault();
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromPointer(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            updateFromPointer(event.clientX);
          }
        }}
      >
        <span className="absolute inset-y-0 left-1/2 w-3 -translate-x-1/2" />
      </div>
      <div
        className="h-full min-w-0 shrink-0"
        style={{
          flexBasis: `calc((100% - 0.375rem) * ${(100 - effectiveRatio) / 100})`,
        }}
      >
        {right}
      </div>
    </div>
  );
}
