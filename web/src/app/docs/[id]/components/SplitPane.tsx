"use client";

import { useCallback, useRef, type ReactNode } from "react";

type Props = {
  ratio: number;
  onRatioChange: (ratio: number) => void;
  left: ReactNode;
  right: ReactNode;
};

export function SplitPane({ ratio, onRatioChange, left, right }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const updateFromPointer = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    onRatioChange(((clientX - rect.left) / rect.width) * 100);
  }, [onRatioChange]);

  return (
    <div ref={containerRef} className="flex h-full min-w-0">
      <div className="h-full min-w-0" style={{ flexBasis: `${ratio}%` }}>{left}</div>
      <div
        role="separator"
        aria-label="Resize editor and preview"
        aria-orientation="vertical"
        aria-valuemin={30}
        aria-valuemax={70}
        aria-valuenow={ratio}
        tabIndex={0}
        className="group relative z-20 w-1.5 shrink-0 cursor-col-resize bg-border outline-none focus:bg-primary"
        onDoubleClick={() => onRatioChange(50)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") onRatioChange(ratio - 5);
          else if (event.key === "ArrowRight") onRatioChange(ratio + 5);
          else if (event.key === "Home") onRatioChange(30);
          else if (event.key === "End") onRatioChange(70);
          else return;
          event.preventDefault();
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromPointer(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(event.clientX);
        }}
      >
        <span className="absolute inset-y-0 left-1/2 w-3 -translate-x-1/2" />
      </div>
      <div className="h-full min-w-0 flex-1">{right}</div>
    </div>
  );
}
