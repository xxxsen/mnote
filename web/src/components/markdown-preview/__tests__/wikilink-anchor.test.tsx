import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const stablePush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: stablePush }),
}));
vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

import { apiFetch } from "@/lib/api";
import WikilinkAnchor from "../wikilink-anchor";

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => { vi.clearAllMocks(); });

describe("WikilinkAnchor", () => {
  it("renders title text", () => {
    render(<WikilinkAnchor title="My Doc" />);
    expect(screen.getByText("My Doc")).toBeTruthy();
  });

  it("renders with link href", () => {
    const { container } = render(<WikilinkAnchor title="Doc" />);
    const a = container.querySelector("a");
    expect(a).toBeTruthy();
    expect(a?.getAttribute("href")).toContain("Doc");
  });

  it("navigates to idHref on click", async () => {
    const { container } = render(<WikilinkAnchor title="Doc" idHref="/docs/abc123" />);
    const link = container.querySelector("a")!;
    fireEvent.click(link);
    expect(stablePush).toHaveBeenCalledWith("/docs/abc123");
  });

  it("resolves wikilink by title search", async () => {
    mockApiFetch.mockResolvedValue([{ id: "d1", title: "My Note" }]);
    render(<WikilinkAnchor title="My Note" />);
    const link = screen.getByText("My Note").closest("a")!;
    fireEvent.click(link);
    await waitFor(() => { expect(stablePush).toHaveBeenCalledWith("/docs/d1"); });
  });

  it("navigates to search when no match found", async () => {
    mockApiFetch.mockResolvedValue([]);
    render(<WikilinkAnchor title="Unknown" />);
    const link = screen.getByText("Unknown").closest("a")!;
    fireEvent.click(link);
    await waitFor(() => { expect(stablePush).toHaveBeenCalledWith(expect.stringContaining("/docs?q=")); });
  });

  it("handles API error gracefully", async () => {
    mockApiFetch.mockRejectedValue(new Error("network"));
    render(<WikilinkAnchor title="Error" />);
    const link = screen.getByText("Error").closest("a")!;
    fireEvent.click(link);
    await waitFor(() => { expect(stablePush).toHaveBeenCalledWith(expect.stringContaining("/docs?q=")); });
  });

  it("triggers hover callbacks", () => {
    const enter = vi.fn();
    const leave = vi.fn();
    render(<WikilinkAnchor title="Test" onPreviewEnter={enter} onPreviewLeave={leave} />);
    const link = screen.getByText("Test").closest("a")!;
    fireEvent.mouseEnter(link);
    expect(enter).toHaveBeenCalled();
    fireEvent.mouseLeave(link);
    expect(leave).toHaveBeenCalled();
  });

  it("shows link-to title attribute", () => {
    const { container } = render(<WikilinkAnchor title="Doc" />);
    const a = container.querySelector("a");
    expect(a?.getAttribute("title")).toBe("Link to: Doc");
  });
});
