import { describe, it, expect } from "vitest";
import { MAX_TAGS, FLOATING_PANEL_COLLAPSED_KEY, EMOJI_TABS, COLORS, SIZES } from "../constants";

describe("MAX_TAGS", () => {
  it("is a positive number", () => {
    expect(MAX_TAGS).toBe(7);
  });
});

describe("FLOATING_PANEL_COLLAPSED_KEY", () => {
  it("is a non-empty string", () => {
    expect(FLOATING_PANEL_COLLAPSED_KEY).toBe("mnote:floating-panel-collapsed");
  });
});

describe("EMOJI_TABS", () => {
  it("has multiple tabs", () => {
    expect(EMOJI_TABS.length).toBeGreaterThan(5);
  });

  it("each tab has required fields", () => {
    for (const tab of EMOJI_TABS) {
      expect(tab.key).toBeTruthy();
      expect(tab.label).toBeTruthy();
      expect(tab.icon).toBeTruthy();
      expect(tab.items.length).toBeGreaterThan(0);
    }
  });

  it("has unique keys", () => {
    const keys = EMOJI_TABS.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("COLORS", () => {
  it("has default and named colors", () => {
    expect(COLORS.length).toBeGreaterThan(5);
    expect(COLORS[0]).toEqual({ label: "Default", value: "" });
  });

  it("non-default colors have hex values", () => {
    for (const c of COLORS.slice(1)) {
      expect(c.value).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("SIZES", () => {
  it("has multiple sizes with px values", () => {
    expect(SIZES.length).toBeGreaterThan(3);
    for (const s of SIZES) {
      expect(s.value).toMatch(/px$/);
    }
  });
});
