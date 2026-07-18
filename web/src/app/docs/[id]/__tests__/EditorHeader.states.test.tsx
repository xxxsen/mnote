import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorHeader } from "../components/EditorHeader";
import type { EditorSyncStatus } from "../types";

afterEach(cleanup);

function renderHeader(status: EditorSyncStatus, titleMissing = false) {
  return render(
    <EditorHeader
      onBack={vi.fn()}
      title="Live title"
      syncStatus={status}
      titleMissing={titleMissing}
      onSave={vi.fn()}
      onRetry={vi.fn()}
      onResolveConflict={vi.fn()}
      outlineOpen
      detailsOpen={false}
      onShowOutline={vi.fn()}
      onToggleDetails={vi.fn()}
      starred={0}
      handleStarToggle={vi.fn()}
      viewMode="split"
      setViewMode={vi.fn()}
    />,
  );
}

describe("EditorHeader synchronization states", () => {
  it.each([
    ["SYNCED", "Save", true],
    ["LOCAL_CHANGES", "Save", false],
    ["SAVING", "Saving…", true],
    ["QUEUED", "Saving…", true],
    ["ERROR", "Retry", false],
    ["CONFLICT", "Resolve conflict", false],
  ] as const)("%s exposes %s with disabled=%s", (status, label, disabled) => {
    renderHeader(status);
    expect(screen.getByRole("button", { name: label })).toHaveProperty(
      "disabled",
      disabled,
    );
  });

  it("keeps a titleless local draft local until a title is added", () => {
    renderHeader("LOCAL_CHANGES", true);
    expect(screen.getByRole("button", { name: "Save" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByText("Live title")).toBeTruthy();
    expect(screen.queryByText("General")).toBeNull();
  });
});
