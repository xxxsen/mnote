import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EDITOR_VIEW_MODE_STORAGE_KEY,
  NEW_NOTE_EDITOR_VIEW_MODE,
  loadEditorViewModePreference,
  saveEditorViewModePreference,
  type EditorViewMode,
} from "../editor-view-mode";

describe("editor view mode preference", () => {
  beforeEach(() => window.localStorage.clear());

  afterEach(() => vi.unstubAllGlobals());

  it("defaults new and unstored editor modes to split", () => {
    expect(NEW_NOTE_EDITOR_VIEW_MODE).toBe("split");
    expect(loadEditorViewModePreference()).toBe("split");
  });

  it("uses the existing storage key", () => {
    expect(EDITOR_VIEW_MODE_STORAGE_KEY).toBe("mnote:editor-view-mode:v1");
  });

  it.each<EditorViewMode>(["edit", "split", "preview"])(
    "reads and writes the %s preference",
    (mode) => {
      saveEditorViewModePreference(mode);

      expect(window.localStorage.getItem(EDITOR_VIEW_MODE_STORAGE_KEY)).toBe(
        mode,
      );
      expect(loadEditorViewModePreference()).toBe(mode);
    },
  );

  it("falls back to split for an invalid stored value", () => {
    window.localStorage.setItem(EDITOR_VIEW_MODE_STORAGE_KEY, "invalid");

    expect(loadEditorViewModePreference()).toBe("split");
  });

  it("is safe to read and write during server rendering", () => {
    vi.stubGlobal("window", undefined);

    expect(loadEditorViewModePreference()).toBe("split");
    expect(() => saveEditorViewModePreference("preview")).not.toThrow();
  });
});
