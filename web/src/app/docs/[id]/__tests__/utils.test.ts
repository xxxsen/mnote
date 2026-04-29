import { describe, it, expect } from "vitest";
import { slugify, getText, normalizeTagName, isValidTagName, extractTitleFromContent, randomBase62, extractLinkedDocIDs, downloadFile } from "../utils";
import React from "react";

describe("slugify", () => {
  it("lowercases and hyphenates", () => { expect(slugify("Hello World")).toBe("hello-world"); });
  it("strips special chars", () => { expect(slugify("a@b#c")).toBe("abc"); });
  it("collapses multiple hyphens", () => { expect(slugify("a---b")).toBe("a-b"); });
  it("trims leading/trailing hyphens", () => { expect(slugify("-abc-")).toBe("abc"); });
  it("returns section for empty result", () => { expect(slugify("@#$")).toBe("section"); });
  it("handles Chinese chars", () => { expect(slugify("你好世界")).toBe("你好世界"); });
});

describe("getText", () => {
  it("returns string for string input", () => { expect(getText("hello")).toBe("hello"); });
  it("returns string for number input", () => { expect(getText(42)).toBe("42"); });
  it("returns empty for null/undefined", () => {
    expect(getText(null)).toBe("");
    expect(getText(undefined)).toBe("");
  });
  it("joins array items", () => { expect(getText(["a", "b"])).toBe("ab"); });
  it("extracts text from React element", () => {
    const el = React.createElement("span", null, "text");
    expect(getText(el)).toBe("text");
  });
  it("returns empty for non-element object", () => { expect(getText({} as never)).toBe(""); });
});

describe("normalizeTagName", () => {
  it("trims whitespace", () => { expect(normalizeTagName("  go  ")).toBe("go"); });
  it("handles empty string", () => { expect(normalizeTagName("")).toBe(""); });
});

describe("isValidTagName", () => {
  it("accepts letters and numbers", () => { expect(isValidTagName("go123")).toBe(true); });
  it("accepts Chinese characters", () => { expect(isValidTagName("笔记")).toBe(true); });
  it("rejects empty", () => { expect(isValidTagName("")).toBe(false); });
  it("rejects too long (>16 chars)", () => { expect(isValidTagName("a".repeat(17))).toBe(false); });
  it("rejects special chars", () => { expect(isValidTagName("a b")).toBe(false); });
});

describe("extractTitleFromContent", () => {
  it("extracts h1 header", () => { expect(extractTitleFromContent("# Title")).toBe("Title"); });
  it("extracts setext heading", () => { expect(extractTitleFromContent("Title\n====")).toBe("Title"); });
  it("truncates long first line", () => {
    const long = "a".repeat(60);
    expect(extractTitleFromContent(long)).toBe("a".repeat(50) + "...");
  });
  it("returns short first line as-is", () => { expect(extractTitleFromContent("short")).toBe("short"); });
  it("skips blank lines", () => { expect(extractTitleFromContent("\n\n# Title")).toBe("Title"); });
  it("returns empty for empty content", () => { expect(extractTitleFromContent("")).toBe(""); });
});

describe("randomBase62", () => {
  it("returns correct length", () => { expect(randomBase62(8)).toHaveLength(8); });
  it("returns empty for 0", () => { expect(randomBase62(0)).toBe(""); });
  it("returns different values", () => { expect(randomBase62(16)).not.toBe(randomBase62(16)); });
});

describe("extractLinkedDocIDs", () => {
  it("extracts doc IDs from links", () => {
    expect(extractLinkedDocIDs("/docs/abc /docs/def", "x")).toEqual(["abc", "def"]);
  });
  it("excludes specified ID", () => {
    expect(extractLinkedDocIDs("/docs/abc /docs/def", "abc")).toEqual(["def"]);
  });
  it("deduplicates", () => {
    expect(extractLinkedDocIDs("/docs/abc /docs/abc", "x")).toEqual(["abc"]);
  });
  it("returns empty for no matches", () => {
    expect(extractLinkedDocIDs("no links here", "x")).toEqual([]);
  });
});

describe("downloadFile", () => {
  it("creates and clicks a download link", () => {
    const click = vi.fn();
    const createElement = vi.spyOn(document, "createElement").mockReturnValue({ click, href: "", download: "", style: {} } as unknown as HTMLAnchorElement);
    const appendChild = vi.spyOn(document.body, "appendChild").mockReturnValue(null as never);
    const removeChild = vi.spyOn(document.body, "removeChild").mockReturnValue(null as never);
    downloadFile("content", "test.md", "text/markdown");
    expect(click).toHaveBeenCalled();
    expect(createElement).toHaveBeenCalledWith("a");
    expect(appendChild).toHaveBeenCalled();
    expect(removeChild).toHaveBeenCalled();
    createElement.mockRestore();
    appendChild.mockRestore();
    removeChild.mockRestore();
  });
});

import { vi } from "vitest";
