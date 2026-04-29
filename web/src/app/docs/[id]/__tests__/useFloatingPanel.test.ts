import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFloatingPanel } from "../hooks/useFloatingPanel";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

const baseOpts = {
  docId: "d1",
  previewContent: "",
  summary: "",
  backlinks: [],
  outboundLinks: [],
};

describe("useFloatingPanel", () => {
  it("initializes with defaults", () => {
    const { result } = renderHook(() => useFloatingPanel(baseOpts));
    expect(result.current.tocContent).toBe("");
    expect(result.current.tocCollapsed).toBe(false);
    expect(result.current.floatingPanelTab).toBe("toc");
    expect(result.current.floatingPanelTouched).toBe(false);
  });

  it("reads collapsed state from localStorage", () => {
    localStorage.setItem("mnote:floating-panel-collapsed", "1");
    const { result } = renderHook(() => useFloatingPanel(baseOpts));
    expect(result.current.tocCollapsed).toBe(true);
  });

  it("handleTocLoaded sets toc content", () => {
    const { result } = renderHook(() => useFloatingPanel(baseOpts));
    act(() => { result.current.handleTocLoaded("- Heading 1"); });
    expect(result.current.tocContent).toBe("- Heading 1");
  });

  it("hasTocPanel is true when toc content exists and [toc] token in preview", () => {
    const { result } = renderHook(() => useFloatingPanel({ ...baseOpts, previewContent: "[toc]\n# H1" }));
    act(() => { result.current.handleTocLoaded("- H1"); });
    expect(result.current.hasTocPanel).toBe(true);
  });

  it("hasMentionsPanel is true with backlinks", () => {
    const { result } = renderHook(() => useFloatingPanel({ ...baseOpts, backlinks: [{ id: "b1" }] as never[] }));
    expect(result.current.hasMentionsPanel).toBe(true);
  });

  it("hasGraphPanel is true with backlinks or outbound", () => {
    const { result } = renderHook(() => useFloatingPanel({ ...baseOpts, outboundLinks: [{ id: "o1" }] as never[] }));
    expect(result.current.hasGraphPanel).toBe(true);
  });

  it("hasSummaryPanel is true with non-empty summary", () => {
    const { result } = renderHook(() => useFloatingPanel({ ...baseOpts, summary: "This is a summary" }));
    expect(result.current.hasSummaryPanel).toBe(true);
  });

  it("availableFloatingTabs reflects available panels", () => {
    const { result } = renderHook(() =>
      useFloatingPanel({
        ...baseOpts,
        previewContent: "[toc]\n# H",
        summary: "summary",
        backlinks: [{ id: "b1" }] as never[],
        outboundLinks: [{ id: "o1" }] as never[],
      })
    );
    act(() => { result.current.handleTocLoaded("- H"); });
    expect(result.current.availableFloatingTabs).toContain("toc");
    expect(result.current.availableFloatingTabs).toContain("mentions");
    expect(result.current.availableFloatingTabs).toContain("graph");
    expect(result.current.availableFloatingTabs).toContain("summary");
  });

  it("setTocCollapsed persists to localStorage", () => {
    const { result } = renderHook(() => useFloatingPanel(baseOpts));
    act(() => { result.current.setTocCollapsed(true); });
    expect(localStorage.getItem("mnote:floating-panel-collapsed")).toBe("1");
  });

  it("setFloatingPanelTab changes tab", () => {
    const { result } = renderHook(() =>
      useFloatingPanel({ ...baseOpts, backlinks: [{ id: "b1" }] as never[] })
    );
    act(() => { result.current.setFloatingPanelTab("mentions"); result.current.setFloatingPanelTouched(true); });
    expect(result.current.floatingPanelTab).toBe("mentions");
  });
});
