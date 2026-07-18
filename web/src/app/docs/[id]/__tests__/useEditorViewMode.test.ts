import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { clampSplitRatio, useEditorViewMode } from "../hooks/useEditorViewMode";

describe("useEditorViewMode", () => {
  beforeEach(() => window.localStorage.clear());

  it("loads and persists mode, clamped ratio, and scroll sync preference", () => {
    window.localStorage.setItem("mnote:editor-view-mode:v1", "preview");
    window.localStorage.setItem("mnote:editor-split-ratio:v1", "65");
    window.localStorage.setItem("mnote:editor-scroll-sync:v1", "false");
    const { result } = renderHook(() => useEditorViewMode());

    expect(result.current.viewMode).toBe("preview");
    expect(result.current.splitRatio).toBe(65);
    expect(result.current.scrollSyncEnabled).toBe(false);

    act(() => {
      result.current.setViewMode("split");
      result.current.setSplitRatio(99);
      result.current.setScrollSyncEnabled(true);
    });
    expect(result.current.viewMode).toBe("split");
    expect(result.current.splitRatio).toBe(70);
    expect(result.current.scrollSyncEnabled).toBe(true);
    expect(window.localStorage.getItem("mnote:editor-view-mode:v1")).toBe("split");
    expect(window.localStorage.getItem("mnote:editor-split-ratio:v1")).toBe("70");
    expect(window.localStorage.getItem("mnote:editor-scroll-sync:v1")).toBe("true");
  });

  it("falls back for invalid stored values and clamps both boundaries", () => {
    window.localStorage.setItem("mnote:editor-view-mode:v1", "invalid");
    window.localStorage.setItem("mnote:editor-split-ratio:v1", "5");
    const { result } = renderHook(() => useEditorViewMode());

    expect(result.current.viewMode).toBe("split");
    expect(result.current.splitRatio).toBe(50);
    expect(clampSplitRatio(29)).toBe(30);
    expect(clampSplitRatio(71)).toBe(70);
  });
});
