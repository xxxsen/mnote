import { describe, it, expect } from "vitest";
import { cn, formatDate, generatePixelAvatar } from "../utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("handles conditional classes", () => {
    expect(cn("a", false && "b", "c")).toBe("a c");
  });

  it("resolves tailwind conflicts", () => {
    const result = cn("p-4", "p-2");
    expect(result).toBe("p-2");
  });

  it("handles empty input", () => {
    expect(cn()).toBe("");
  });
});

describe("formatDate", () => {
  it("returns empty string for 0", () => {
    expect(formatDate(0)).toBe("");
  });

  it("formats a known timestamp", () => {
    const ts = 1704067200;
    const result = formatDate(ts);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it("pads single-digit months and days", () => {
    const result = formatDate(1704067200);
    expect(result).toMatch(/-\d{2}-/);
  });
});

describe("generatePixelAvatar", () => {
  it("returns a data URI SVG", () => {
    const result = generatePixelAvatar("test");
    expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("returns consistent output for same seed", () => {
    const a = generatePixelAvatar("seed");
    const b = generatePixelAvatar("seed");
    expect(a).toBe(b);
  });

  it("returns different output for different seeds", () => {
    const a = generatePixelAvatar("aaa");
    const b = generatePixelAvatar("bbb");
    expect(a).not.toBe(b);
  });

  it("handles empty string seed", () => {
    const result = generatePixelAvatar("");
    expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
  });
});
