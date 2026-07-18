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

  function setup(enabled = true) {
    const scrollDOM = {
      scrollTop: 200,
      scrollHeight: 1000,
      clientHeight: 200,
    };
    const dispatch = vi.fn();
    const view = {
      scrollDOM,
      lineBlockAtHeight: () => ({ from: 40 }),
      state: {
        doc: {
          lines: 100,
          lineAt: () => ({ number: 20 }),
          line: (line: number) => ({ from: line * 10 }),
        },
      },
      dispatch,
    } as unknown as EditorView;
    const hook = renderHook(() => useScrollSync({
      loading: false,
      enabled,
      editorViewRef: { current: view },
    }));
    const preview = document.createElement("div");
    Object.defineProperties(preview, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 200 },
    });
    for (const [line, top] of [[10, 100], [30, 500]] as const) {
      const marker = document.createElement("h2");
      marker.dataset.sourceLine = String(line);
      Object.defineProperty(marker, "offsetTop", { configurable: true, value: top });
      preview.appendChild(marker);
    }
    act(() => {
      hook.result.current.previewRef.current = preview;
    });
    return { ...hook, preview, dispatch };
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

  it("does not schedule either direction while synchronization is disabled", () => {
    const harness = setup(false);

    act(() => {
      harness.result.current.handleEditorScroll();
      harness.result.current.handlePreviewScroll();
    });

    expect(frames).toHaveLength(0);
  });
});
