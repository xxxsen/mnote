import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DetailsSidebar } from "../components/DetailsSidebar";

function sidebarProps(onClose: () => void) {
  return {
    showDetails: true,
    onClose,
    activeTab: "summary" as const,
    setActiveTab: vi.fn(),
    summary: "",
    aiLoading: false,
    onGenerateSummary: vi.fn(),
    onShowDeleteConfirm: vi.fn(),
    onExportMarkdown: vi.fn(),
    onExportConfluenceHTML: vi.fn(),
    documentActions: {
      listVersions: vi.fn().mockResolvedValue([]),
    },
    onRevert: vi.fn(),
    shareUrl: "",
    activeShare: null,
    copied: false,
    onShare: vi.fn(),
    onLoadShare: vi.fn(),
    onRevokeShare: vi.fn(),
    onCopyLink: vi.fn(),
    onUpdateShareConfig: vi.fn().mockResolvedValue(undefined),
  };
}

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.dispatchEvent(new Event("resize"));
}

describe("DetailsSidebar focus lifecycle", () => {
  beforeEach(() => setViewport(1024));
  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  it("keeps focus stable across parent rerenders and uses the latest close callback", () => {
    const firstClose = vi.fn();
    const secondClose = vi.fn();
    const { rerender } = render(<DetailsSidebar {...sidebarProps(firstClose)} />);

    const summaryTab = screen.getByRole("button", { name: "Summary" });
    summaryTab.focus();
    expect(document.activeElement).toBe(summaryTab);

    rerender(<DetailsSidebar {...sidebarProps(secondClose)} />);

    expect(document.activeElement).toBe(summaryTab);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(firstClose).not.toHaveBeenCalled();
    expect(secondClose).toHaveBeenCalledTimes(1);
  });

  it.each([390, 768, 1024])(
    "uses the shared modal drawer at %ipx",
    (width) => {
      setViewport(width);
      render(<DetailsSidebar {...sidebarProps(vi.fn())} />);

      const drawer = screen.getByRole("dialog", { name: "Document details" });
      expect(drawer.getAttribute("aria-modal")).toBe("true");
      expect(document.body.style.overflow).toBe("hidden");
    },
  );

  it("uses non-modal complementary semantics when the sidebar is docked", () => {
    setViewport(1440);
    render(<DetailsSidebar {...sidebarProps(vi.fn())} />);
    const dock = screen.getByRole("complementary", { name: "Document details" });
    expect(dock.getAttribute("aria-modal")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });
});
