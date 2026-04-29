import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/code-sandbox", () => ({
  CodeSandbox: ({ code }: { code: string }) => <pre data-testid="sandbox">{code}</pre>,
}));
vi.mock("../code-block", () => ({
  default: ({ children }: { children: string }) => <code data-testid="code-block">{children}</code>,
}));
vi.mock("../mermaid-block", () => ({
  default: ({ code }: { code: string }) => <div data-testid="mermaid">{code}</div>,
}));
vi.mock("../wikilink-anchor", () => ({
  default: ({ children }: { children: React.ReactNode }) => <span data-testid="wikilink">{children}</span>,
}));

import { buildMarkdownComponents } from "../renderers";

const noop = vi.fn();

describe("buildMarkdownComponents", () => {
  it("returns correct component keys", () => {
    const comps = buildMarkdownComponents(noop, noop);
    expect(comps).toBeDefined();
    expect(typeof comps.pre).toBe("function");
    expect(typeof comps.a).toBe("function");
    expect(typeof comps.h1).toBe("function");
    expect(typeof comps.h2).toBe("function");
    expect(typeof comps.h3).toBe("function");
    expect(typeof comps.h4).toBe("function");
    expect(typeof comps.h5).toBe("function");
    expect(typeof comps.h6).toBe("function");
    expect(typeof comps.code).toBe("function");
    expect(typeof comps.img).toBe("function");
    expect(typeof comps.span).toBe("function");
    expect(typeof comps.div).toBe("function");
  });

  it("renders heading elements", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const H1 = comps.h1 as React.FC<{ children: React.ReactNode }>;
    const { container } = render(<H1>Title</H1>);
    expect(container.querySelector("h1")).toBeTruthy();
    expect(container.textContent).toContain("Title");
  });

  it("renders external links with target=_blank", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const A = comps.a as React.FC<{ href?: string; children: React.ReactNode }>;
    render(<A href="https://example.com">Link</A>);
    const link = screen.getByText("Link");
    expect(link.closest("a")?.getAttribute("target")).toBe("_blank");
  });

  it("renders /docs/ links as WikilinkAnchor", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const A = comps.a as React.FC<{ href?: string; children: React.ReactNode }>;
    const { container } = render(<A href="/docs/123">Internal</A>);
    expect(container.querySelector("[data-testid='wikilink']")).toBeTruthy();
  });

  it("renders non-docs internal links without target=_blank", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const A = comps.a as React.FC<{ href?: string; children: React.ReactNode }>;
    const { container } = render(<A href="/settings">Settings</A>);
    const a = container.querySelector("a");
    expect(a).toBeTruthy();
    expect(a?.getAttribute("target")).toBeNull();
  });

  it("renders span component", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const Span = comps.span as React.FC<{ children: React.ReactNode; style?: React.CSSProperties }>;
    const { container } = render(<Span>text</Span>);
    expect(container.textContent).toContain("text");
  });

  it("renders div component", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const Div = comps.div as React.FC<{ children: React.ReactNode }>;
    const { container } = render(<Div>content</Div>);
    expect(container.textContent).toContain("content");
  });

  it("renders img component", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const Img = comps.img as React.FC<{ src?: string; alt?: string }>;
    const { container } = render(<Img src="test.png" alt="test" />);
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
  });

  it("pre renderer passes through children", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const Pre = comps.pre as React.FC<{ children: React.ReactNode }>;
    const { container } = render(<Pre><code>test</code></Pre>);
    expect(container.textContent).toContain("test");
  });

  it("code renderer renders inline code without className", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const Code = comps.code as React.FC<{ className?: string; children: React.ReactNode }>;
    const { container } = render(<Code>inline code</Code>);
    expect(container.querySelector("code")?.textContent).toBe("inline code");
  });

  it("code renderer renders code block with language", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const Code = comps.code as React.FC<{ className?: string; children: React.ReactNode }>;
    const { container } = render(<Code className="language-javascript">const x = 1;</Code>);
    expect(container.querySelector("[data-testid='code-block']")).toBeTruthy();
  });

  it("code renderer renders mermaid as MermaidBlock", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const Code = comps.code as React.FC<{ className?: string; children: React.ReactNode }>;
    const { container } = render(<Code className="language-mermaid">graph TD; A--&gt;B;</Code>);
    expect(container.querySelector("[data-testid='mermaid']")).toBeTruthy();
  });

  it("code renderer renders toc as nav", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const Code = comps.code as React.FC<{ className?: string; children: React.ReactNode }>;
    const { container } = render(<Code className="language-toc">- H1</Code>);
    expect(container.querySelector("nav.toc-wrapper")).toBeTruthy();
  });

  it("code renderer renders runnable sandbox", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const Code = comps.code as React.FC<{ className?: string; metastring?: string; children: React.ReactNode }>;
    const { container } = render(<Code className="language-go" metastring="[runnable]">fmt.Println</Code>);
    expect(container.querySelector("[data-testid='sandbox']")).toBeTruthy();
  });

  it("code renderer parses language with colon (fileName)", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const Code = comps.code as React.FC<{ className?: string; children: React.ReactNode }>;
    const { container } = render(<Code className="language-ts:main.ts">code</Code>);
    expect(container.querySelector("[data-testid='code-block']")).toBeTruthy();
  });

  it("img renderer renders video for VIDEO: prefix", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const Img = comps.img as React.FC<{ src?: string; alt?: string }>;
    const { container } = render(<Img src="video.mp4" alt="VIDEO:clip.mp4" />);
    expect(container.querySelector("video")).toBeTruthy();
  });

  it("img renderer renders audio for AUDIO: prefix", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const Img = comps.img as React.FC<{ src?: string; alt?: string }>;
    const { container } = render(<Img src="audio.mp3" alt="AUDIO:song.mp3" />);
    expect(container.querySelector("audio")).toBeTruthy();
  });

  it("img renderer shows filename for PIC: prefix", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const Img = comps.img as React.FC<{ src?: string; alt?: string }>;
    const { container } = render(<Img src="image.png" alt="PIC:photo.png" />);
    expect(container.textContent).toContain("photo.png");
  });

  it("div renderer renders admonition styles", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const Div = comps.div as React.FC<{ className?: string; children: React.ReactNode }>;
    const { container } = render(<Div className="md-alert-warning">Warning!</Div>);
    expect(container.querySelector(".md-alert-warning")).toBeTruthy();
  });

  it("div renderer renders info admonition", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const Div = comps.div as React.FC<{ className?: string; children: React.ReactNode }>;
    const { container } = render(<Div className="md-alert-info">Info</Div>);
    expect(container.querySelector(".md-alert-info")).toBeTruthy();
  });

  it("div renderer renders tip admonition", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const Div = comps.div as React.FC<{ className?: string; children: React.ReactNode }>;
    const { container } = render(<Div className="md-alert-tip">Tip</Div>);
    expect(container.querySelector(".md-alert-tip")).toBeTruthy();
  });

  it("div renderer renders error admonition", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const Div = comps.div as React.FC<{ className?: string; children: React.ReactNode }>;
    const { container } = render(<Div className="md-alert-error">Error</Div>);
    expect(container.querySelector(".md-alert-error")).toBeTruthy();
  });

  it("font renderer applies color and size", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const Font = comps.font as React.FC<{ color?: string; size?: string; children: React.ReactNode }>;
    const { container } = render(<Font color="red" size="5">Big text</Font>);
    const span = container.querySelector("span");
    expect(span?.style.color).toBe("red");
  });

  it("pre renderer unwraps fenced code children", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const Pre = comps.pre as React.FC<{ children: React.ReactNode }>;
    const child = React.createElement("code", { className: "language-go" }, "code");
    const { container } = render(<Pre>{child}</Pre>);
    expect(container.querySelector("pre")).toBeNull();
  });

  it("pre renderer wraps non-language code in pre", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const Pre = comps.pre as React.FC<{ children: React.ReactNode }>;
    const { container } = render(<Pre>plain text</Pre>);
    expect(container.querySelector("pre")).toBeTruthy();
  });

  it("a renderer handles wikilink data attribute", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const A = comps.a as React.FC<{ node?: { properties?: { dataWikilink?: string } }; children: React.ReactNode }>;
    const { container } = render(<A node={{ properties: { dataWikilink: "My Page" } }}>content</A>);
    expect(container.querySelector("[data-testid='wikilink']")).toBeTruthy();
  });

  it("img extracts filename from URL", () => {
    const comps = buildMarkdownComponents(noop, noop);
    const Img = comps.img as React.FC<{ src?: string; alt?: string }>;
    const { container } = render(<Img src="https://example.com/uploads/photo.png" alt="A photo" />);
    expect(container.textContent).toContain("photo.png");
  });
});
