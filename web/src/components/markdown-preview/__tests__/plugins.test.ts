import { describe, it, expect } from "vitest";
import { remarkSoftBreaks, rehypeCodeMeta } from "../plugins";

describe("remarkSoftBreaks", () => {
  const plugin = remarkSoftBreaks();

  it("splits text nodes with newlines into text + break pairs", () => {
    const tree = {
      type: "root",
      children: [
        { type: "paragraph", children: [{ type: "text", value: "line1\nline2" }] },
      ],
    };
    plugin(tree);
    const kids = tree.children[0].children;
    expect(kids).toHaveLength(3);
    expect(kids[0]).toEqual({ type: "text", value: "line1" });
    expect(kids[1]).toEqual({ type: "break" });
    expect(kids[2]).toEqual({ type: "text", value: "line2" });
  });

  it("skips code nodes", () => {
    const tree = {
      type: "root",
      children: [
        { type: "paragraph", children: [{ type: "code", value: "a\nb" }] },
      ],
    };
    plugin(tree);
    expect(tree.children[0].children).toHaveLength(1);
    expect(tree.children[0].children[0].type).toBe("code");
  });

  it("skips inlineCode nodes", () => {
    const tree = {
      type: "root",
      children: [
        { type: "paragraph", children: [{ type: "inlineCode", value: "x\ny" }] },
      ],
    };
    plugin(tree);
    expect(tree.children[0].children).toHaveLength(1);
  });

  it("handles text without newlines unchanged", () => {
    const tree = {
      type: "root",
      children: [{ type: "paragraph", children: [{ type: "text", value: "hello" }] }],
    };
    plugin(tree);
    expect(tree.children[0].children).toHaveLength(1);
    expect(tree.children[0].children[0].value).toBe("hello");
  });

  it("handles nodes without children", () => {
    const tree = { type: "root" };
    expect(() => plugin(tree)).not.toThrow();
  });

  it("handles empty text value with newline", () => {
    const tree = {
      type: "root",
      children: [{ type: "paragraph", children: [{ type: "text", value: "\n" }] }],
    };
    plugin(tree);
    const kids = tree.children[0].children;
    expect(kids.some((c: { type: string }) => c.type === "break")).toBe(true);
  });

  it("recurses into nested children", () => {
    const tree = {
      type: "root",
      children: [{
        type: "blockquote",
        children: [{
          type: "paragraph",
          children: [{ type: "text", value: "a\nb" }],
        }],
      }],
    };
    plugin(tree);
    const innerKids = tree.children[0].children[0].children;
    expect(innerKids.some((c: { type: string }) => c.type === "break")).toBe(true);
  });
});

describe("rehypeCodeMeta", () => {
  const plugin = rehypeCodeMeta();

  it("adds metastring from data.meta", () => {
    const tree = {
      type: "element",
      tagName: "code",
      properties: {} as Record<string, unknown>,
      data: { meta: "runnable" },
      children: [],
    };
    plugin(tree);
    expect(tree.properties.metastring).toBe("runnable");
  });

  it("creates properties object if missing", () => {
    const tree = {
      type: "element",
      tagName: "code",
      properties: undefined as Record<string, unknown> | undefined,
      data: { meta: "test" },
      children: [],
    };
    plugin(tree);
    expect(tree.properties?.metastring).toBe("test");
  });

  it("does not modify non-code elements", () => {
    const tree = {
      type: "element",
      tagName: "div",
      properties: {},
      children: [],
    };
    plugin(tree);
    expect((tree.properties as Record<string, unknown>).metastring).toBeUndefined();
  });

  it("recurses into children", () => {
    const tree = {
      type: "element",
      tagName: "pre",
      children: [{
        type: "element",
        tagName: "code",
        properties: {},
        data: { meta: "highlight" },
        children: [],
      }],
    };
    plugin(tree);
    expect((tree.children[0] as { properties: Record<string, unknown> }).properties.metastring).toBe("highlight");
  });

  it("handles tree without data.meta", () => {
    const tree = {
      type: "element",
      tagName: "code",
      properties: {},
      children: [],
    };
    plugin(tree);
    expect((tree.properties as Record<string, unknown>).metastring).toBeUndefined();
  });
});
