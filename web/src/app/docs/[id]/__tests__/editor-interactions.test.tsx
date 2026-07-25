import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Dialog } from "@/components/ui/dialog";
import { EditorHeader } from "../components/EditorHeader";
import { SplitPane } from "../components/SplitPane";
import { getFloatingPosition } from "../hooks/usePopover";

afterEach(() => {
  document.body.innerHTML = "";
  document.body.style.overflow = "";
});

describe("editor interaction primitives", () => {
  it("traps modal semantics and honors a non-dismissible decision dialog", () => {
    const onClose = vi.fn();
    render(
      <Dialog open title="Decision" onClose={onClose} dismissPolicy="explicit">
        <button type="button">Choose</button>
      </Dialog>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("resizes split panes with keyboard controls", () => {
    const onRatioChange = vi.fn();
    render(
      <SplitPane
        ratio={50}
        onRatioChange={onRatioChange}
        left={<div />}
        right={<div />}
      />,
    );
    const separator = screen.getByRole("separator");
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    fireEvent.keyDown(separator, { key: "Home" });
    fireEvent.doubleClick(separator);
    expect(onRatioChange.mock.calls.map((call) => call[0])).toEqual([
      55, 30, 50,
    ]);
  });

  it("clamps floating panels and flips above when needed", () => {
    const result = getFloatingPosition(
      { top: 700, bottom: 740, left: 360, right: 400, width: 40, height: 40 },
      { width: 320, height: 300 },
      { width: 390, height: 844 },
    );
    expect(result.placement).toBe("top");
    expect(result.left).toBeGreaterThanOrEqual(8);
    expect(result.left + 320).toBeLessThanOrEqual(382);
  });

  it("renders Retry and Resolve conflict from the sync status", () => {
    const common = {
      onBack: vi.fn(),
      title: "Live title",
      titleMissing: false,
      onSave: vi.fn(),
      onRetry: vi.fn(),
      onResolveConflict: vi.fn(),
      outlineOpen: true,
      detailsOpen: false,
      onShowOutline: vi.fn(),
      onToggleDetails: vi.fn(),
      starred: 0,
      handleStarToggle: vi.fn(),
      viewMode: "split" as const,
      setViewMode: vi.fn(),
      scrollSyncEnabled: true,
      onToggleScrollSync: vi.fn(),
      linkedNotesOpen: false,
      linkedNotesLoaded: false,
      linkedNotesCount: 0,
      onLinkedNotesTriggerElement: vi.fn(),
      onMobileMenuTriggerElement: vi.fn(),
      onToggleLinkedNotes: vi.fn(),
      onOpenLinkedNotes: vi.fn(),
    };
    const { rerender } = render(
      <EditorHeader {...common} syncStatus="ERROR" />,
    );
    fireEvent.click(screen.getByLabelText("Retry"));
    expect(common.onRetry).toHaveBeenCalledTimes(1);
    rerender(<EditorHeader {...common} syncStatus="CONFLICT" />);
    fireEvent.click(screen.getByLabelText("Resolve conflict"));
    expect(common.onResolveConflict).toHaveBeenCalledTimes(1);
  });
});
