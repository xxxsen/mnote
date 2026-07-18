import { act, renderHook } from "@testing-library/react";
import type { EditorView } from "@codemirror/view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useScrollSync } from "../hooks/useScrollSync";

type Frame = { id: number; callback: FrameRequestCallback; cancelled: boolean };

describe("useScrollSync behavior", () => {
  let frames: Frame[];
  let nextFrameID: number;

  beforeEach(() => {
    frames = [];
    nextFrameID = 1;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextFrameID;
      nextFrameID += 1;
      frames.push({ id, callback, cancelled: false });
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => {
      const frame = frames.find((candidate) => candidate.id === id);
      if (frame) frame.cancelled = true;
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  function runNextFrame() {
    const frame = frames.find((candidate) => !candidate.cancelled);
    if (!frame) throw new Error("No animation frame is pending");
    frame.cancelled = true;
    frame.callback(0);
  }

  function setup(
    enabled = true,
    options: {
      content?: string;
      topLine?: number;
      middleLine?: number;
    } = {},
  ) {
    const scrollDOM = {
      scrollTop: 200,
      scrollHeight: 1000,
      clientHeight: 200,
    };
    const topLine = options.topLine ?? 20;
    const middleLine = options.middleLine ?? topLine;
    const lineBlockAtHeight = vi.fn((height: number) => ({
      from: (height > scrollDOM.scrollTop ? middleLine : topLine) * 10,
    }));
    const dispatch = vi.fn();
    const view = {
      scrollDOM,
      lineBlockAtHeight,
      state: {
        doc: {
          lines: 100,
          lineAt: (from: number) => ({ number: from / 10 }),
          line: (line: number) => ({ from: line * 10 }),
        },
      },
      dispatch,
    } as unknown as EditorView;
    const editorViewRef = { current: view };
    const hook = renderHook(
      ({ scopeKey, content }) =>
        useScrollSync({
          loading: false,
          enabled,
          content,
          scopeKey,
          editorViewRef,
        }),
      {
        initialProps: {
          scopeKey: "doc-a",
          content:
            options.content ??
            "# Intro\n" + "\n".repeat(13) + "## Details",
        },
      },
    );
    const preview = document.createElement("div");
    Object.defineProperties(preview, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 200 },
    });
    for (const [line, top] of [
      [10, 100],
      [30, 500],
    ] as const) {
      const marker = document.createElement("h2");
      marker.dataset.sourceLine = String(line);
      marker.id = line === 10 ? "intro" : "details";
      Object.defineProperty(marker, "offsetTop", {
        configurable: true,
        value: top,
      });
      preview.appendChild(marker);
    }
    act(() => {
      hook.result.current.previewRef.current = preview;
    });
    return { ...hook, preview, dispatch, lineBlockAtHeight };
  }

  it("coalesces editor scrolls into one frame and interpolates source markers", () => {
    const harness = setup();

    act(() => {
      harness.result.current.handleEditorScroll();
      harness.result.current.handleEditorScroll();
    });
    expect(frames).toHaveLength(2);
    expect(frames.filter((frame) => frame.cancelled)).toHaveLength(1);

    act(runNextFrame);
    expect(harness.preview.scrollTop).toBe(300);
  });

  it("uses the editor midline for Outline while preserving top-line preview sync", () => {
    const content = [
      "# Intro",
      ...Array.from({ length: 13 }, () => ""),
      "## Details",
      ...Array.from({ length: 9 }, () => ""),
      "## Later",
    ].join("\n");
    const harness = setup(true, {
      content,
      topLine: 20,
      middleLine: 30,
    });

    act(() => harness.result.current.handleEditorScroll());
    act(runNextFrame);

    expect(harness.lineBlockAtHeight).toHaveBeenNthCalledWith(1, 300);
    expect(harness.lineBlockAtHeight).toHaveBeenNthCalledWith(2, 200);
    expect(harness.result.current.activeTocId).toBe("later");
    expect(harness.preview.scrollTop).toBe(300);
  });

  it("maps preview markers back to the editor and supports one-shot suppression", () => {
    const harness = setup();
    harness.preview.scrollTop = 480;
    const resume = harness.result.current.suppressNextSync();

    act(() => harness.result.current.handlePreviewScroll());
    expect(frames).toHaveLength(0);

    act(() => {
      resume();
      harness.result.current.handlePreviewScroll();
    });
    act(runNextFrame);
    expect(harness.dispatch).toHaveBeenCalledTimes(1);
  });

  it("keeps preview scrolling authoritative while CodeMirror settles its delayed scroll", () => {
    const harness = setup();
    harness.preview.scrollTop = 480;

    act(() => harness.result.current.handlePreviewScroll());
    act(runNextFrame);
    expect(harness.dispatch).toHaveBeenCalledTimes(1);
    expect(harness.result.current.scrollingSource.current).toBe("preview");

    act(runNextFrame);
    expect(harness.result.current.scrollingSource.current).toBe("preview");

    act(() => harness.result.current.handleEditorScroll());
    expect(harness.preview.scrollTop).toBe(480);

    act(runNextFrame);
    expect(harness.result.current.scrollingSource.current).toBeNull();
    expect(harness.preview.scrollTop).toBe(480);
  });

  it("resets reused heading ids across documents while keeping the editor listener stable", () => {
    const harness = setup(false);
    const boundHandler = harness.result.current.handleEditorScroll;

    act(() => boundHandler());
    act(runNextFrame);
    expect(harness.result.current.activeTocId).toBe("details");

    harness.rerender({
      scopeKey: "doc-b",
      content: "# Intro\n" + "\n".repeat(13) + "## Details",
    });
    expect(harness.result.current.activeTocId).toBe("intro");
    expect(harness.result.current.handleEditorScroll).toBe(boundHandler);

    act(() => boundHandler());
    act(runNextFrame);
    expect(harness.result.current.activeTocId).toBe("details");
  });

  it("tracks the active section without synchronizing while synchronization is disabled", () => {
    const harness = setup(false);

    act(() => harness.result.current.handleEditorScroll());
    expect(frames).toHaveLength(1);
    act(runNextFrame);

    expect(harness.result.current.activeTocId).toBe("details");
    expect(harness.preview.scrollTop).toBe(0);
    expect(harness.dispatch).not.toHaveBeenCalled();

    harness.preview.scrollTop = 480;
    act(() => harness.result.current.handlePreviewScroll());
    act(runNextFrame);
    expect(harness.result.current.activeTocId).toBe("details");
    expect(harness.dispatch).not.toHaveBeenCalled();
  });

  it("navigates the editor by source line without requiring a preview", () => {
    const harness = setup(false);

    let navigated = false;
    act(() => {
      navigated = harness.result.current.scrollEditorToSourceLine(
        30,
        "details",
      );
    });

    expect(navigated).toBe(true);
    expect(harness.dispatch).toHaveBeenCalledTimes(1);
    expect(harness.result.current.activeTocId).toBe("details");
    expect(
      harness.result.current.scrollEditorToSourceLine(101, "missing"),
    ).toBe(false);
  });

  it("navigates the preview by heading id and honors reduced motion", () => {
    const harness = setup(false);
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    vi.spyOn(harness.preview, "getBoundingClientRect").mockReturnValue({
      top: 100,
    } as DOMRect);
    const details = harness.preview.querySelector<HTMLElement>("#details");
    if (!details) throw new Error("details heading missing");
    vi.spyOn(details, "getBoundingClientRect").mockReturnValue({
      top: 500,
    } as DOMRect);
    const scrollTo = vi.fn(({ top }: ScrollToOptions) => {
      harness.preview.scrollTop = top ?? 0;
    });
    Object.assign(harness.preview, { scrollTo });

    let navigated = false;
    act(() => {
      navigated = harness.result.current.scrollPreviewToHeading("details");
    });

    expect(navigated).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({ top: 400, behavior: "auto" });
    expect(harness.result.current.activeTocId).toBe("details");
    expect(harness.result.current.scrollPreviewToHeading("missing")).toBe(
      false,
    );
    act(runNextFrame);
  });
});
