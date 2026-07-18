import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  activeHeadingForPreview,
  activeHeadingForSourceLine,
  buildTocHeadingMarkers,
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

  it("builds stable duplicate heading ids with source lines", () => {
    expect(buildTocHeadingMarkers("# Intro\n```\n## Ignored\n```\n## Intro")).toEqual([
      { sourceLine: 1, id: "intro" },
      { sourceLine: 5, id: "intro-1" },
    ]);
  });

  it("selects the last heading at or above the editor viewport", () => {
    const headings = [
      { sourceLine: 3, id: "intro" },
      { sourceLine: 12, id: "details" },
    ];
    expect(activeHeadingForSourceLine(headings, 1)).toBe("intro");
    expect(activeHeadingForSourceLine(headings, 12)).toBe("details");
    expect(activeHeadingForSourceLine([], 12)).toBeNull();
  });

  it("selects preview headings at the activation line and forces the final heading at the bottom", () => {
    const preview = document.createElement("div");
    const intro = document.createElement("h1");
    intro.id = "intro";
    const details = document.createElement("h2");
    details.id = "details";
    preview.append(intro, details);
    Object.defineProperties(preview, {
      clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 1000 },
      scrollTop: { configurable: true, writable: true, value: 0 },
    });
    vi.spyOn(preview, "getBoundingClientRect").mockReturnValue({ top: 100 } as DOMRect);
    vi.spyOn(intro, "getBoundingClientRect").mockReturnValue({ top: 120 } as DOMRect);
    const detailsRect = vi.spyOn(details, "getBoundingClientRect").mockReturnValue({ top: 220 } as DOMRect);

    expect(activeHeadingForPreview(preview)).toBe("intro");
    detailsRect.mockReturnValue({ top: 150 } as DOMRect);
    expect(activeHeadingForPreview(preview)).toBe("details");
    preview.scrollTop = 700;
    expect(activeHeadingForPreview(preview)).toBe("details");
  });

  it("exposes current TOC state, rAF handlers, and one-shot suppression", () => {
    const { result } = renderHook(() => useScrollSync({
      loading: false,
      enabled: true,
      content: "# Intro",
      editorViewRef: { current: null },
    }));
    expect(result.current.previewRef).toBeDefined();
    expect(result.current.activeTocId).toBe("intro");
    expect(result.current.handleEditorScroll).toBeTypeOf("function");
    expect(result.current.handlePreviewScroll).toBeTypeOf("function");
    expect(result.current.suppressNextSync).toBeTypeOf("function");
    expect(() => result.current.suppressNextSync()).not.toThrow();
  });
});
