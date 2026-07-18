import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FloatingPanel } from "../components/FloatingPanel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("FloatingPanel TOC", () => {
  function renderPanel(activeTocId: string) {
    const props = {
      showDetails: false,
      hasTocPanel: true,
      hasMentionsPanel: false,
      hasGraphPanel: false,
      hasSummaryPanel: false,
      tocCollapsed: false,
      setTocCollapsed: vi.fn(),
      floatingPanelTab: "toc" as const,
      setFloatingPanelTab: vi.fn(),
      setFloatingPanelTouched: vi.fn(),
      tocContent: "- [Intro](#intro)\n- [Details](#details)",
      summary: "",
      backlinks: [],
      outboundLinks: [],
      linkGraph: { nodes: [], edges: [], positionByID: {} },
      previewRef: { current: null },
      activeTocId,
      suppressNextSync: () => vi.fn(),
      handlePreviewScroll: vi.fn(),
      onNavigate: vi.fn(),
    };
    const view = render(<FloatingPanel {...props} />);
    return { ...view, props };
  }

  it("marks only the current section with location semantics", () => {
    const { getByRole } = renderPanel("details");

    const detailsLink = getByRole("link", { name: "Details" });
    expect(detailsLink.getAttribute("aria-current")).toBe("location");
    expect(detailsLink.classList.contains("toc-active")).toBe(true);
    expect(getByRole("link", { name: "Intro" }).hasAttribute("aria-current")).toBe(false);
  });

  it("keeps the active entry inside the scrollable panel viewport", () => {
    const { container, getByRole, rerender, props } = renderPanel("intro");
    const scrollContainer = container.querySelector<HTMLElement>(
      ".custom-scrollbar",
    );
    getByRole("link", { name: "Details" });
    expect(scrollContainer).not.toBeNull();

    scrollContainer!.scrollTop = 0;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === scrollContainer) return { top: 0, bottom: 100 } as DOMRect;
      if (this.dataset.tocId === "details") return { top: 120, bottom: 140 } as DOMRect;
      return { top: 20, bottom: 40 } as DOMRect;
    });

    rerender(<FloatingPanel {...props} activeTocId="details" />);

    expect(scrollContainer!.scrollTop).toBe(52);
  });
});
