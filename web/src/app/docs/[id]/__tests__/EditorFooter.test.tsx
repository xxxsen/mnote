import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { EditorFooter } from "../components/EditorFooter";
import type { EditorSyncStatus } from "../types";

afterEach(cleanup);

function renderFooter(status: EditorSyncStatus, options?: {
  titleMissing?: boolean;
  onRetry?: () => void;
}) {
  return render(
    <EditorFooter
      cursorPos={{ line: 1, col: 1 }}
      wordCount={2}
      charCount={10}
      saveStatus={status}
      titleMissing={options?.titleMissing}
      onRetry={options?.onRetry}
    />,
  );
}

describe("EditorFooter save status indicator", () => {
  it.each([
    ["SYNCED", "Synced"],
    ["LOCAL_CHANGES", "Local changes"],
    ["SAVING", "Saving"],
    ["QUEUED", "Saving latest changes"],
    ["CONFLICT", "Conflict needs attention"],
  ] as const)("renders %s from the centralized status machine", (status, label) => {
    renderFooter(status);
    const node = screen.getByTestId("editor-save-status");
    expect(node.getAttribute("data-status")).toBe(status);
    expect(node.textContent).toContain(label);
  });

  it("renders ERROR as an actionable alert", () => {
    const onRetry = vi.fn();
    renderFooter("ERROR", { onRetry });
    const node = screen.getByRole("alert");
    expect(node.getAttribute("data-status")).toBe("ERROR");
    fireEvent.click(node);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("explains why a titleless draft stays local", () => {
    renderFooter("LOCAL_CHANGES", { titleMissing: true });
    expect(screen.getByTestId("editor-save-status").textContent).toContain(
      "Draft saved locally — add a title to sync",
    );
  });
});
