import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn().mockResolvedValue(undefined),
    render: vi.fn().mockResolvedValue({ svg: '<svg>rendered</svg>' }),
  },
}));

import mermaid from "mermaid";
import Mermaid from "../mermaid";

beforeEach(() => { vi.clearAllMocks(); });

describe("Mermaid", () => {
  it("renders container div", () => {
    const { container } = render(<Mermaid chart="graph TD; A-->B;" />);
    expect(container.querySelector(".mermaid-container")).toBeTruthy();
  });

  it("initializes mermaid on mount", () => {
    render(<Mermaid chart="graph TD; A-->B;" />);
    expect(mermaid.initialize).toHaveBeenCalled();
  });

  it("renders chart SVG", async () => {
    const { container } = render(<Mermaid chart="graph TD; A-->B;" />);
    await waitFor(() => {
      expect(container.querySelector(".mermaid-container")?.innerHTML).toContain("svg");
    });
  });

  it("shows error on render failure", async () => {
    vi.mocked(mermaid.render).mockRejectedValueOnce(new Error("syntax error"));
    const { container } = render(<Mermaid chart="invalid mermaid" />);
    await waitFor(() => {
      expect(container.textContent).toContain("Invalid Mermaid Syntax");
    });
  });

  it("does not render empty chart", () => {
    render(<Mermaid chart="" />);
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it("does not render 'undefined' chart", () => {
    render(<Mermaid chart="undefined" />);
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it("uses cacheKey when provided", async () => {
    render(<Mermaid chart="graph TD; A-->B;" cacheKey="test-key" />);
    await waitFor(() => { expect(mermaid.render).toHaveBeenCalled(); });
  });
});
