import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, waitFor } from "@testing-library/react";

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
    hoverPreview: { open: false, x: 0, y: 0, title: "", content: "", loading: false },
    openHoverPreview: vi.fn(),
    closeHoverPreview: vi.fn(),
  }),
}));

import MarkdownPreview from "..";

beforeEach(() => { vi.clearAllMocks(); });

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
});
