import { createRef } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditorToolbar } from "../components/EditorToolbar";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("EditorToolbar accessibility", () => {
  it("gives every formatting control an accessible name", () => {
    render(
      <EditorToolbar
        handleUndo={vi.fn()}
        handleRedo={vi.fn()}
        executeCommand={vi.fn()}
        handleAiPolish={vi.fn()}
        handleAiGenerateOpen={vi.fn()}
        handleAiTags={vi.fn()}
        handlePreviewOpen={vi.fn()}
        aiBusy={false}
        activePopover={null}
        setActivePopover={vi.fn()}
        colorButtonRef={createRef<HTMLButtonElement>()}
        sizeButtonRef={createRef<HTMLButtonElement>()}
        emojiButtonRef={createRef<HTMLButtonElement>()}
        currentTheme="dark-plus"
        onThemeChange={vi.fn()}
      />,
    );

    const toolbar = screen.getByRole("toolbar", { name: "Markdown formatting" });
    const expectedButtons = [
      "Undo",
      "Redo",
      "Heading 1",
      "Heading 2",
      "Bold",
      "Italic",
      "Strikethrough",
      "Underline",
      "Text Color",
      "Font Size",
      "Bullet List",
      "Ordered List",
      "Todo List",
      "Quote",
      "Inline Code",
      "Code Block",
      "Link",
      "Table",
      "Emoji",
      "AI Polish",
      "AI Generate",
      "AI Tags",
      "Preview",
    ];
    for (const name of expectedButtons) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    expect(toolbar.querySelectorAll("button")).toHaveLength(expectedButtons.length);
    expect(screen.getByRole("combobox", { name: "Editor Theme" })).toBeTruthy();
  });
});
