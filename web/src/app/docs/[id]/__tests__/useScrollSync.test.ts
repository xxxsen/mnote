import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  interpolatePreviewOffset,
  nearestSourceLine,
  useScrollSync,
} from "../hooks/useScrollSync";

describe("structured scroll sync", () => {
  it("interpolates between adjacent source markers", () => {
    expect(interpolatePreviewOffset([
      { sourceLine: 10, offsetTop: 100 },
      { sourceLine: 20, offsetTop: 300 },
    ], 15)).toBe(200);
  });

  it("uses the only available marker at either boundary", () => {
    const markers = [
      { sourceLine: 10, offsetTop: 100 },
      { sourceLine: 20, offsetTop: 300 },
    ];
    expect(interpolatePreviewOffset(markers, 2)).toBe(100);
    expect(interpolatePreviewOffset(markers, 30)).toBe(300);
    expect(interpolatePreviewOffset([], 2)).toBeNull();
  });

  it("finds the source marker nearest the preview top", () => {
    expect(nearestSourceLine([
      { sourceLine: 1, offsetTop: 0 },
      { sourceLine: 20, offsetTop: 450 },
      { sourceLine: 40, offsetTop: 900 },
    ], 500)).toBe(20);
    expect(nearestSourceLine([], 500)).toBeNull();
  });

  it("exposes rAF handlers and one-shot TOC suppression", () => {
    const { result } = renderHook(() => useScrollSync({
      loading: false,
      enabled: true,
      editorViewRef: { current: null },
    }));
    expect(result.current.previewRef).toBeDefined();
    expect(result.current.handleEditorScroll).toBeTypeOf("function");
    expect(result.current.handlePreviewScroll).toBeTypeOf("function");
    expect(result.current.suppressNextSync).toBeTypeOf("function");
    expect(() => result.current.suppressNextSync()).not.toThrow();
  });
});
