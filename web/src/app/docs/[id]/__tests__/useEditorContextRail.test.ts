import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CONTEXT_RAIL_DOCK_MIN_WIDTH,
  useEditorContextRail,
} from "../hooks/useEditorContextRail";

type MediaHarness = {
  setMatches: (matches: boolean) => void;
};

function installMatchMedia(initialMatches: boolean): MediaHarness {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    get matches() {
      return matches;
    },
    media: `(min-width: ${CONTEXT_RAIL_DOCK_MIN_WIDTH}px)`,
    onchange: null,
    addEventListener: (
      _type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      listeners.add(listener);
    },
    removeEventListener: (
      _type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) => {
      listeners.delete(listener);
    },
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => media),
  );
  return {
    setMatches(next) {
      matches = next;
      const event = {
        matches: next,
        media: media.media,
      } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("useEditorContextRail", () => {
  it("defaults to an expanded Outline rail and persists only collapse preference", () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useEditorContextRail("doc-a"));

    expect(result.current.isDocked).toBe(true);
    expect(result.current.view).toBe("outline");
    expect(result.current.detailsTab).toBe("history");
    expect(result.current.outlineOpen).toBe(true);
    expect(result.current.detailsOpen).toBe(false);

    act(() => result.current.toggleCollapsed());
    expect(result.current.collapsed).toBe(true);
    expect(localStorage.getItem("mnote:editor-context-rail:collapsed:v1")).toBe(
      "1",
    );
  });

  it("treats invalid stored values as expanded", () => {
    localStorage.setItem("mnote:editor-context-rail:collapsed:v1", "invalid");
    installMatchMedia(true);
    const { result } = renderHook(() => useEditorContextRail("doc-a"));
    expect(result.current.collapsed).toBe(false);
  });

  it("resets the view and Details tab for a new document without resetting collapse", () => {
    installMatchMedia(true);
    const { result, rerender } = renderHook(
      ({ docId }) => useEditorContextRail(docId),
      { initialProps: { docId: "doc-a" } },
    );

    act(() => {
      result.current.openDetails("share");
      result.current.setCollapsed(true);
    });
    rerender({ docId: "doc-b" });

    expect(result.current.view).toBe("outline");
    expect(result.current.detailsTab).toBe("history");
    expect(result.current.drawerOpen).toBe(false);
    expect(result.current.collapsed).toBe(true);
  });

  it("uses a drawer below the dock breakpoint and closes it when docking", () => {
    const viewport = installMatchMedia(false);
    const { result } = renderHook(() => useEditorContextRail("doc-a"));

    act(() => result.current.openOutline());
    expect(result.current.drawerOpen).toBe(true);
    expect(result.current.view).toBe("outline");

    act(() => viewport.setMatches(true));
    expect(result.current.isDocked).toBe(true);
    expect(result.current.drawerOpen).toBe(false);
    expect(result.current.view).toBe("outline");
  });

  it("makes the toolbar Details action switch with Outline and reopen at History", () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useEditorContextRail("doc-a"));

    act(() => result.current.toggleDetails());
    expect(result.current.view).toBe("details");
    expect(result.current.detailsTab).toBe("history");
    expect(result.current.detailsOpen).toBe(true);

    act(() => result.current.setDetailsTab("share"));
    act(() => result.current.toggleDetails());
    expect(result.current.view).toBe("outline");
    expect(result.current.outlineOpen).toBe(true);

    act(() => result.current.toggleDetails());
    expect(result.current.view).toBe("details");
    expect(result.current.detailsTab).toBe("history");
    expect(result.current.detailsOpen).toBe(true);
  });

  it("temporarily expands Details without replacing a collapsed preference", () => {
    localStorage.setItem("mnote:editor-context-rail:collapsed:v1", "1");
    installMatchMedia(true);
    const { result } = renderHook(() => useEditorContextRail("doc-a"));

    expect(result.current.collapsed).toBe(true);
    act(() => result.current.toggleDetails());
    expect(result.current.view).toBe("details");
    expect(result.current.detailsOpen).toBe(true);
    expect(result.current.collapsed).toBe(false);
    expect(localStorage.getItem("mnote:editor-context-rail:collapsed:v1")).toBe(
      "1",
    );

    act(() => result.current.toggleDetails());
    expect(result.current.view).toBe("outline");
    expect(result.current.collapsed).toBe(true);
    expect(result.current.outlineOpen).toBe(false);
    expect(localStorage.getItem("mnote:editor-context-rail:collapsed:v1")).toBe(
      "1",
    );
  });

  it("persists an explicit Outline expansion from the collapsed rail", () => {
    localStorage.setItem("mnote:editor-context-rail:collapsed:v1", "1");
    installMatchMedia(true);
    const { result } = renderHook(() => useEditorContextRail("doc-a"));

    act(() => result.current.openOutline());

    expect(result.current.outlineOpen).toBe(true);
    expect(result.current.collapsed).toBe(false);
    expect(localStorage.getItem("mnote:editor-context-rail:collapsed:v1")).toBe(
      "0",
    );
  });

  it("lets an explicit collapse cancel a temporary Details expansion", () => {
    localStorage.setItem("mnote:editor-context-rail:collapsed:v1", "1");
    installMatchMedia(true);
    const { result } = renderHook(() => useEditorContextRail("doc-a"));

    act(() => result.current.openDetails());
    expect(result.current.detailsOpen).toBe(true);
    act(() => result.current.toggleCollapsed());

    expect(result.current.collapsed).toBe(true);
    expect(result.current.detailsOpen).toBe(false);
    expect(localStorage.getItem("mnote:editor-context-rail:collapsed:v1")).toBe(
      "1",
    );
  });

  it("preserves the active Details tab when opened from a collapsed shortcut", () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useEditorContextRail("doc-a"));

    act(() => result.current.openDetails("share"));
    act(() => result.current.setCollapsed(true));
    act(() => result.current.openDetails());

    expect(result.current.detailsTab).toBe("share");
    expect(result.current.detailsOpen).toBe(true);
  });

  it("clears a temporary Details expansion when the document changes", () => {
    localStorage.setItem("mnote:editor-context-rail:collapsed:v1", "1");
    installMatchMedia(true);
    const { result, rerender } = renderHook(
      ({ docId }) => useEditorContextRail(docId),
      { initialProps: { docId: "doc-a" } },
    );

    act(() => result.current.openDetails("share"));
    expect(result.current.detailsOpen).toBe(true);
    rerender({ docId: "doc-b" });

    expect(result.current.view).toBe("outline");
    expect(result.current.detailsTab).toBe("history");
    expect(result.current.collapsed).toBe(true);
    expect(result.current.outlineOpen).toBe(false);
    expect(localStorage.getItem("mnote:editor-context-rail:collapsed:v1")).toBe(
      "1",
    );
  });

  it("switches an open mobile Details drawer directly to Outline", () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useEditorContextRail("doc-a"));

    act(() => result.current.toggleDetails());
    expect(result.current.detailsOpen).toBe(true);
    act(() => result.current.toggleDetails());
    expect(result.current.view).toBe("outline");
    expect(result.current.outlineOpen).toBe(true);
    expect(result.current.drawerOpen).toBe(true);
  });
});
