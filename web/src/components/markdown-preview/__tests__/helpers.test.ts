import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createSlugger, getHastText, convertWikilinks, extractHeadings,
  buildTocMarkdown, injectToc, toSafeInlineStyle, copyToClipboard,
} from "../helpers";

describe("createSlugger", () => {
  it("slugifies simple text", () => {
    const slug = createSlugger();
    expect(slug("Hello World")).toBe("hello-world");
  });

  it("handles unicode characters", () => {
    const slug = createSlugger();
    expect(slug("你好")).toBe("你好");
  });

  it("deduplicates same text", () => {
    const slug = createSlugger();
    expect(slug("test")).toBe("test");
    expect(slug("test")).toBe("test-1");
    expect(slug("test")).toBe("test-2");
  });

  it("strips special characters", () => {
    const slug = createSlugger();
    expect(slug("a@b#c")).toBe("abc");
  });

  it("falls back to section for empty result", () => {
    const slug = createSlugger();
    expect(slug("@#$")).toBe("section");
  });

  it("collapses multiple hyphens", () => {
    const slug = createSlugger();
    expect(slug("a   b   c")).toBe("a-b-c");
  });
});

describe("getHastText", () => {
  it("returns text value for text nodes", () => {
    expect(getHastText({ type: "text", value: "hello" })).toBe("hello");
  });

  it("recursively concatenates children", () => {
    const node = {
      type: "element",
      children: [
        { type: "text", value: "a" },
        { type: "element", children: [{ type: "text", value: "b" }] },
      ],
    };
    expect(getHastText(node)).toBe("ab");
  });

  it("returns empty for nodes without value or children", () => {
    expect(getHastText({ type: "element" })).toBe("");
  });

  it("handles empty value", () => {
    expect(getHastText({ type: "text", value: "" })).toBe("");
  });
});

describe("convertWikilinks", () => {
  it("converts [[title]] to anchor tags", () => {
    const result = convertWikilinks("See [[My Note]]");
    expect(result).toContain('data-wikilink="My Note"');
    expect(result).toContain("class=\"wikilink\"");
    expect(result).toContain("My Note</a>");
  });

  it("does not convert inside code blocks", () => {
    const input = "```\n[[note]]\n```";
    expect(convertWikilinks(input)).toBe(input);
  });

  it("handles multiple wikilinks", () => {
    const result = convertWikilinks("[[a]] and [[b]]");
    expect(result).toContain('data-wikilink="a"');
    expect(result).toContain('data-wikilink="b"');
  });

  it("escapes quotes in title", () => {
    const result = convertWikilinks('[[he"llo]]');
    expect(result).toContain("&quot;");
  });
});

describe("extractHeadings", () => {
  it("extracts h1 to h6", () => {
    const content = "# H1\n## H2\n### H3\n#### H4\n##### H5\n###### H6";
    const headings = extractHeadings(content);
    expect(headings).toHaveLength(6);
    expect(headings[0]).toEqual({ level: 1, text: "H1" });
    expect(headings[5]).toEqual({ level: 6, text: "H6" });
  });

  it("ignores headings in code blocks", () => {
    const content = "```\n# Not a heading\n```\n# Real heading";
    const headings = extractHeadings(content);
    expect(headings).toHaveLength(1);
    expect(headings[0].text).toBe("Real heading");
  });

  it("handles empty content", () => {
    expect(extractHeadings("")).toEqual([]);
  });

  it("handles content with no headings", () => {
    expect(extractHeadings("just text\nmore text")).toEqual([]);
  });
});

describe("buildTocMarkdown", () => {
  it("returns empty string for no headings", () => {
    expect(buildTocMarkdown([])).toBe("");
  });

  it("builds nested list from headings", () => {
    const headings = [
      { level: 1, text: "Intro" },
      { level: 2, text: "Sub" },
    ];
    const toc = buildTocMarkdown(headings);
    expect(toc).toContain("- [Intro]");
    expect(toc).toContain("  - [Sub]");
  });

  it("uses heading.id when available", () => {
    const headings = [{ level: 1, text: "Title", id: "custom-id" }];
    const toc = buildTocMarkdown(headings);
    expect(toc).toContain("#custom-id");
  });

  it("generates slugs when id is missing", () => {
    const headings = [{ level: 1, text: "Hello World" }];
    const toc = buildTocMarkdown(headings);
    expect(toc).toContain("#hello-world");
  });
});

describe("injectToc", () => {
  it("replaces [toc] token with toc content", () => {
    const content = "# Title\n[toc]\n## Section";
    const toc = "- [Title](#title)\n- [Section](#section)";
    const result = injectToc(content, toc);
    expect(result).toContain("```toc");
    expect(result).toContain(toc);
  });

  it("removes [toc] when toc is empty", () => {
    const content = "# Title\n[toc]\n## Section";
    const result = injectToc(content, "");
    expect(result).not.toContain("[toc]");
    expect(result).not.toContain("```toc");
  });

  it("handles [TOC] uppercase", () => {
    const content = "[TOC]\n# Title";
    const toc = "- [Title](#title)";
    const result = injectToc(content, toc);
    expect(result).toContain("```toc");
  });

  it("does not replace inside code blocks", () => {
    const content = "```\n[toc]\n```";
    const result = injectToc(content, "toc-content");
    expect(result).not.toContain("```toc");
  });
});

describe("toSafeInlineStyle", () => {
  it("returns empty for falsy value", () => {
    expect(toSafeInlineStyle(null)).toEqual({});
    expect(toSafeInlineStyle(undefined)).toEqual({});
    expect(toSafeInlineStyle("")).toEqual({});
  });

  it("parses style string", () => {
    const result = toSafeInlineStyle("color: red; font-size: 14px");
    expect(result).toEqual({ color: "red", fontSize: "14px" });
  });

  it("handles object style", () => {
    const result = toSafeInlineStyle({ color: "blue", "font-size": "16px" });
    expect(result).toEqual({ color: "blue", fontSize: "16px" });
  });

  it("returns empty for non-string non-object", () => {
    expect(toSafeInlineStyle(42)).toEqual({});
    expect(toSafeInlineStyle(true)).toEqual({});
  });

  it("ignores empty declarations", () => {
    expect(toSafeInlineStyle(";;")).toEqual({});
  });
});

describe("copyToClipboard", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("uses clipboard API when available", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const result = await copyToClipboard("test");
    expect(result).toBe(true);
  });

  it("falls back to execCommand when clipboard fails", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    const textarea = { value: "", setAttribute: vi.fn(), style: {} as CSSStyleDeclaration, select: vi.fn() };
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      if (tag === "textarea") return textarea as unknown as HTMLTextAreaElement;
      return origCreate(tag);
    });
    vi.spyOn(document.body, "appendChild").mockImplementation(n => n);
    vi.spyOn(document.body, "removeChild").mockImplementation(n => n);
    (document as unknown as Record<string, unknown>).execCommand = vi.fn().mockReturnValue(true);
    const result = await copyToClipboard("test");
    expect(result).toBe(true);
    expect(textarea.select).toHaveBeenCalled();
    delete (document as unknown as Record<string, unknown>).execCommand;
  });
});
