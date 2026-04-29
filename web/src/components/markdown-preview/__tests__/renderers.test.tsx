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
});
