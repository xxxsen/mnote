import { describe, it, expect, beforeEach } from "vitest";
import {
  THEMES,
  DEFAULT_THEME_ID,
  getThemeById,
  loadThemePreference,
  saveThemePreference,
  type ThemeId,
} from "../editor-themes";

describe("editor-themes", () => {
  // ---------- Theme registry ----------

  it("should have at least 3 themes", () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(3);
  });

  it("should have unique IDs", () => {
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("should include dark-plus as the default", () => {
    expect(DEFAULT_THEME_ID).toBe("dark-plus");
    expect(THEMES.some((t) => t.id === "dark-plus")).toBe(true);
  });

  it("each theme should have required fields", () => {
    for (const theme of THEMES) {
      expect(theme.id).toBeTruthy();
      expect(theme.label).toBeTruthy();
      expect(typeof theme.dark).toBe("boolean");
      expect(theme.extension).toBeTruthy();
    }
  });

  it("should have both dark and light themes", () => {
    const hasDark = THEMES.some((t) => t.dark);
    const hasLight = THEMES.some((t) => !t.dark);
    expect(hasDark).toBe(true);
    expect(hasLight).toBe(true);
  });

  it("dark-plus should be a dark theme", () => {
    const dp = getThemeById("dark-plus");
    expect(dp.dark).toBe(true);
  });

  it("light-plus should be a light theme", () => {
    const lp = getThemeById("light-plus");
    expect(lp.dark).toBe(false);
  });

  // ---------- getThemeById ----------

  it("should return the correct theme by ID", () => {
    for (const theme of THEMES) {
      expect(getThemeById(theme.id).id).toBe(theme.id);
    }
  });

  it("should fall back to first theme for unknown ID", () => {
    const result = getThemeById("nonexistent" as ThemeId);
    expect(result.id).toBe(THEMES[0].id);
  });

  // ---------- localStorage persistence ----------

  beforeEach(() => {
    localStorage.clear();
  });

  it("should return default when nothing is stored", () => {
    expect(loadThemePreference()).toBe(DEFAULT_THEME_ID);
  });

  it("should save and load a valid theme preference", () => {
    saveThemePreference("monokai");
    expect(loadThemePreference()).toBe("monokai");
  });

  it("should fall back to default for invalid stored value", () => {
    localStorage.setItem("mnote-editor-theme", "invalid-theme-id");
    expect(loadThemePreference()).toBe(DEFAULT_THEME_ID);
  });

  it("should round-trip all theme IDs", () => {
    for (const theme of THEMES) {
      saveThemePreference(theme.id);
      expect(loadThemePreference()).toBe(theme.id);
    }
  });
});
