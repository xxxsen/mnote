import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, waitFor, cleanup } from "@testing-library/react";

let mockHoverState = { open: false, x: 0, y: 0, title: "", content: "", loading: false };
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));
vi.mock("remark-gfm", () => ({ default: () => {} }));
vi.mock("remark-math", () => ({ default: () => {} }));
vi.mock("rehype-katex", () => ({ default: () => {} }));
vi.mock("rehype-raw", () => ({ default: () => {} }));
vi.mock("../renderers", () => ({
  buildMarkdownComponents: vi.fn().mockReturnValue({}),
}));
vi.mock("../hooks/use-hover-preview", () => ({
  useHoverPreview: () => ({
    hoverPreview: mockHoverState,
    openHoverPreview: vi.fn(),
    closeHoverPreview: vi.fn(),
  }),
}));

import MarkdownPreview from "..";

beforeEach(() => {
  vi.clearAllMocks();
  mockHoverState = { open: false, x: 0, y: 0, title: "", content: "", loading: false };
});
afterEach(() => { cleanup(); });

describe("MarkdownPreview", () => {
  it("renders markdown content", () => {
    const { container } = render(<MarkdownPreview content="# Hello World" />);
    expect(container.querySelector("[data-testid='markdown']")).toBeTruthy();
  });

  it("has markdown-body container", () => {
    const { container } = render(<MarkdownPreview content="Hello **world**" />);
    expect(container.querySelector(".markdown-body")).toBeTruthy();
  });

  it("applies custom className", () => {
    const { container } = render(<MarkdownPreview content="test" className="custom-class" />);
    expect(container.querySelector(".custom-class")).toBeTruthy();
  });

  it("calls onTocLoaded with toc markdown", async () => {
    const onTocLoaded = vi.fn();
    render(<MarkdownPreview content="[toc]\n# Heading 1\n## Heading 2" onTocLoaded={onTocLoaded} />);
    await waitFor(() => { expect(onTocLoaded).toHaveBeenCalled(); });
  });

  it("renders flex layout when showTocAside is true", () => {
    const { container } = render(
      <MarkdownPreview content="[toc]\n# Heading 1\n## Heading 2" showTocAside />
    );
    const wrapper = container.querySelector(".flex");
    expect(wrapper).toBeTruthy();
  });

  it("does not render toc aside by default", () => {
    const { container } = render(<MarkdownPreview content="[toc]\n# Heading" />);
    const aside = container.querySelector("aside");
    expect(aside).toBeNull();
  });

  it("handles empty content", () => {
    const { container } = render(<MarkdownPreview content="" />);
    expect(container.querySelector(".markdown-body")).toBeTruthy();
  });

  it("converts wikilinks in content", () => {
    const { container } = render(<MarkdownPreview content="[[My Page]]" />);
    expect(container.querySelector(".markdown-body")).toBeTruthy();
  });

  it("converts admonitions in content", () => {
    const { container } = render(<MarkdownPreview content=":::note\nThis is a note\n:::" />);
    expect(container.querySelector(".markdown-body")).toBeTruthy();
  });

  it("has proper ref forwarding", () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<MarkdownPreview content="test" ref={ref} />);
    expect(ref.current).toBeTruthy();
    expect(ref.current?.className).toContain("markdown-body");
  });

  it("handles onScroll callback", () => {
    const onScroll = vi.fn();
    const { container } = render(<MarkdownPreview content="test" onScroll={onScroll} />);
    const scrollDiv = container.querySelector(".markdown-body");
    expect(scrollDiv).toBeTruthy();
  });

  it("does not render toc aside when showTocAside is true but no toc content", () => {
    const { container } = render(<MarkdownPreview content="No headings here" showTocAside />);
    const aside = container.querySelector("aside");
    expect(aside).toBeNull();
  });

  it("renders hover preview portal when enabled and open", () => {
    mockHoverState = { open: true, x: 50, y: 100, title: "Preview Title", content: "Preview body", loading: false };
    const { baseElement } = render(
      <MarkdownPreview content="test" enableMentionHoverPreview />
    );
    expect(baseElement.textContent).toContain("Preview Title");
    expect(baseElement.textContent).toContain("Preview body");
  });

  it("hover preview shows loading state", () => {
    mockHoverState = { open: true, x: 10, y: 20, title: "", content: "", loading: true };
    const { baseElement } = render(
      <MarkdownPreview content="test" enableMentionHoverPreview />
    );
    expect(baseElement.textContent).toContain("Loading preview...");
  });

  it("hover preview shows Untitled when no title", () => {
    mockHoverState = { open: true, x: 10, y: 20, title: "", content: "Content here", loading: false };
    const { baseElement } = render(
      <MarkdownPreview content="test" enableMentionHoverPreview />
    );
    expect(baseElement.textContent).toContain("Untitled");
  });

  it("does not render portal when enableMentionHoverPreview is false", () => {
    mockHoverState = { open: true, x: 50, y: 100, title: "Title", content: "Body", loading: false };
    const { baseElement } = render(
      <MarkdownPreview content="test" enableMentionHoverPreview={false} />
    );
    expect(baseElement.querySelector(".backdrop-blur-md")).toBeNull();
  });

  it("does not render portal when hoverPreview.open is false", () => {
    mockHoverState = { open: false, x: 0, y: 0, title: "", content: "", loading: false };
    const { baseElement } = render(
      <MarkdownPreview content="test" enableMentionHoverPreview />
    );
    expect(baseElement.querySelector(".backdrop-blur-md")).toBeNull();
  });

  it("processes inline math notation", () => {
    const { container } = render(<MarkdownPreview content="Inline \\(x^2\\) math" />);
    expect(container.querySelector(".markdown-body")).toBeTruthy();
  });

  it("processes block math notation", () => {
    const { container } = render(<MarkdownPreview content="Block \\[E = mc^2\\] done" />);
    expect(container.querySelector(".markdown-body")).toBeTruthy();
  });

  it("processes content with lazy list continuation", () => {
    const { container } = render(<MarkdownPreview content="1. item\n   continued" />);
    expect(container.querySelector(".markdown-body")).toBeTruthy();
  });

  it("onTocLoaded not called when not provided", () => {
    render(<MarkdownPreview content="# Heading" />);
  });
});
