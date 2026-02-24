import { describe, expect, it } from "vitest";
import { toSafeInlineStyle, toFontSize, convertAdmonitions, FONT_SIZE_MAP } from "@/components/markdown-preview";

describe("toSafeInlineStyle", () => {
    it("parses color and font-size from a CSS string", () => {
        const result = toSafeInlineStyle("color: red; font-size: 16px");
        expect(result).toEqual({ color: "red", fontSize: "16px" });
    });

    it("ignores unsupported CSS properties", () => {
        const result = toSafeInlineStyle("color: blue; background: yellow; display: none");
        expect(result).toEqual({ color: "blue" });
    });

    it("handles object input", () => {
        const result = toSafeInlineStyle({ color: "green", fontSize: "12px", background: "red" });
        expect(result).toEqual({ color: "green", fontSize: "12px" });
    });

    it("returns empty object for falsy input", () => {
        expect(toSafeInlineStyle(null)).toEqual({});
        expect(toSafeInlineStyle(undefined)).toEqual({});
        expect(toSafeInlineStyle("")).toEqual({});
    });

    it("returns empty object for non-string/non-object input", () => {
        expect(toSafeInlineStyle(42)).toEqual({});
        expect(toSafeInlineStyle(true)).toEqual({});
    });

    it("handles CSS values containing colons", () => {
        // e.g. "color: rgb(1, 2, 3)" — split on first colon only
        const result = toSafeInlineStyle("color: rgb(1, 2, 3)");
        expect(result).toEqual({ color: "rgb(1, 2, 3)" });
    });
});

describe("toFontSize", () => {
    it("maps HTML font size numbers to rem values", () => {
        for (const [key, value] of Object.entries(FONT_SIZE_MAP)) {
            expect(toFontSize(key)).toBe(value);
        }
    });

    it("passes through CSS values like '24px' unchanged", () => {
        expect(toFontSize("24px")).toBe("24px");
        expect(toFontSize("1.5rem")).toBe("1.5rem");
    });

    it("returns undefined for empty/missing values", () => {
        expect(toFontSize(undefined)).toBeUndefined();
        expect(toFontSize("")).toBeUndefined();
        expect(toFontSize("  ")).toBeUndefined();
    });
});

describe("convertAdmonitions", () => {
    it("converts :::warning ... ::: into a div wrapper", () => {
        const input = "before\n:::warning\nwarning content\n:::\nafter";
        const expected = 'before\n<div class="md-alert md-alert-warning">\n\nwarning content\n\n</div>\nafter';
        expect(convertAdmonitions(input)).toBe(expected);
    });

    it("handles multiline body", () => {
        const input = ":::warning\nline1\nline2\nline3\n:::";
        const result = convertAdmonitions(input);
        expect(result).toContain("line1");
        expect(result).toContain("line2");
        expect(result).toContain("line3");
        expect(result).toContain("md-alert-warning");
    });

    it("does not convert inside code blocks", () => {
        const input = "```\n:::warning\ncontent\n:::\n```";
        expect(convertAdmonitions(input)).toBe(input);
    });

    it("leaves unclosed admonitions as-is", () => {
        const input = ":::warning\ncontent without closing";
        expect(convertAdmonitions(input)).toBe(input);
    });

    it("is case-insensitive for the type name", () => {
        const input = ":::WARNING\ncontent\n:::";
        const result = convertAdmonitions(input);
        expect(result).toContain("md-alert-warning");
    });

    it("converts :::error into md-alert-error", () => {
        const input = ":::error\nerror content\n:::";
        const result = convertAdmonitions(input);
        expect(result).toContain("md-alert-error");
        expect(result).toContain("error content");
    });

    it("converts :::danger as alias for error", () => {
        const input = ":::danger\ndanger content\n:::";
        const result = convertAdmonitions(input);
        expect(result).toContain("md-alert-error");
    });

    it("converts :::info into md-alert-info", () => {
        const input = ":::info\ninfo content\n:::";
        const result = convertAdmonitions(input);
        expect(result).toContain("md-alert-info");
    });

    it("converts :::note as alias for info", () => {
        const input = ":::note\nnote content\n:::";
        const result = convertAdmonitions(input);
        expect(result).toContain("md-alert-info");
    });

    it("converts :::tip into md-alert-tip", () => {
        const input = ":::tip\ntip content\n:::";
        const result = convertAdmonitions(input);
        expect(result).toContain("md-alert-tip");
    });

    it("converts :::success as alias for tip", () => {
        const input = ":::success\nsuccess content\n:::";
        const result = convertAdmonitions(input);
        expect(result).toContain("md-alert-tip");
    });

    it("leaves unknown admonition types as-is", () => {
        const input = ":::unknown\ncontent\n:::";
        expect(convertAdmonitions(input)).toBe(input);
    });
});
