import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AiModal } from "../components/AiModal";

function renderLoadingModal(closeAiModal: () => void) {
  return render(
    <AiModal
      open
      aiAction="polish"
      aiLoading
      aiPrompt=""
      aiResultText=""
      aiExistingTags={[]}
      aiSuggestedTags={[]}
      aiSelectedTags={[]}
      aiRemovedTagIDs={[]}
      aiError={null}
      aiDiffLines={[]}
      aiTitle="AI Polish"
      aiAvailableSlots={5}
      setAiPrompt={vi.fn()}
      closeAiModal={closeAiModal}
      handleAiGenerate={vi.fn()}
      handleApplyAiText={vi.fn()}
      handleApplyAiTags={vi.fn()}
      handleApplyAiSummary={vi.fn()}
      toggleAiTag={vi.fn()}
      toggleExistingTag={vi.fn()}
    />,
  );
}

describe("AiModal dialog behavior", () => {
  it("remains dismissible by Escape, backdrop, and Close while loading", () => {
    const closeAiModal = vi.fn();
    renderLoadingModal(closeAiModal);

    const dialog = screen.getByRole("dialog", { name: "AI Polish" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(closeAiModal).toHaveBeenCalledTimes(3);
  });
});
