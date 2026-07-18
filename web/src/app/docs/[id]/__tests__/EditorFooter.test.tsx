import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

afterEach(() => { cleanup(); });

import { EditorFooter } from "../components/EditorFooter";
import type { SaveStatus } from "../types";

function renderFooter(overrides: Partial<{ status: SaveStatus; hasUnsavedChanges: boolean }> = {}) {
  return render(
    <EditorFooter
      cursorPos={{ line: 1, col: 1 }}
      wordCount={0}
      charCount={0}
      hasUnsavedChanges={overrides.hasUnsavedChanges ?? false}
      saveStatus={overrides.status ?? "SYNCED"}
    />,
  );
}

function getStatus() {
  return screen.getByTestId("editor-save-status");
}

describe("EditorFooter save status indicator", () => {
  it("renders SYNCED with the synced label and no unsaved changes", () => {
    renderFooter({ status: "SYNCED" });
    const node = getStatus();
    expect(node.getAttribute("data-status")).toBe("SYNCED");
    expect(node.textContent).toContain("SYNCED");
  });

  it("renders SAVING while a request is in flight", () => {
    renderFooter({ status: "SAVING", hasUnsavedChanges: true });
    const node = getStatus();
    expect(node.getAttribute("data-status")).toBe("SAVING");
    expect(node.textContent).toContain("SAVING");
  });

  it("renders QUEUED when another save is waiting behind the in-flight one", () => {
    renderFooter({ status: "QUEUED", hasUnsavedChanges: true });
    const node = getStatus();
    expect(node.getAttribute("data-status")).toBe("QUEUED");
    expect(node.textContent).toContain("QUEUED");
  });

  it("renders ERROR with a directive label telling the user to retry", () => {
    renderFooter({ status: "ERROR", hasUnsavedChanges: true });
    const node = getStatus();
    expect(node.getAttribute("data-status")).toBe("ERROR");
    expect(node.textContent).toContain("Save failed – click to retry");
  });

  it("surfaces local unsaved edits as QUEUED even when the queue is idle", () => {
    // While the save queue is SYNCED, typed-but-not-yet-requested edits are
    // still pending locally; the footer should not lie and say the document
    // is in sync. We promote that state to QUEUED so the indicator color and
    // label match the user's actual situation.
    renderFooter({ status: "SYNCED", hasUnsavedChanges: true });
    const node = getStatus();
    expect(node.getAttribute("data-status")).toBe("QUEUED");
    expect(node.textContent).toContain("QUEUED");
  });
});
