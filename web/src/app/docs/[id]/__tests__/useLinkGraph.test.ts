import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { apiFetch } from "@/lib/api";
import { useLinkGraph } from "../hooks/useLinkGraph";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("../utils", () => ({
  extractLinkedDocIDs: vi.fn().mockReturnValue([]),
}));

const mockApiFetch = vi.mocked(apiFetch);
const { extractLinkedDocIDs: mockExtractLinkedDocIDs } = await import("../utils");

const stableExtract = vi.mocked(mockExtractLinkedDocIDs);

beforeEach(() => { vi.clearAllMocks(); });

describe("useLinkGraph", () => {
  it("initializes with empty backlinks and outbound", () => {
    mockApiFetch.mockResolvedValue([]);
    const { result } = renderHook(() => useLinkGraph({ docId: "d1", title: "Title", previewContent: "" }));
    expect(result.current.backlinks).toEqual([]);
    expect(result.current.outboundLinks).toEqual([]);
  });

  it("fetches backlinks on mount", async () => {
    const backlinks = [{ id: "b1", title: "Backlink1" }];
    mockApiFetch.mockResolvedValue(backlinks);
    const { result } = renderHook(() => useLinkGraph({ docId: "d1", title: "Title", previewContent: "" }));
    await waitFor(() => { expect(result.current.backlinks).toEqual(backlinks); });
  });

  it("handles backlinks fetch error", async () => {
    mockApiFetch.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useLinkGraph({ docId: "d1", title: "Title", previewContent: "" }));
    await waitFor(() => { expect(result.current.backlinks).toEqual([]); });
  });

  it("fetches outbound links when extractLinkedDocIDs returns IDs", async () => {
    stableExtract.mockReturnValue(["o1", "o2"]);
    mockApiFetch.mockImplementation(((url: string) => {
      if (url.includes("/backlinks")) return Promise.resolve([]);
      if (url.includes("/o1")) return Promise.resolve({ document: { id: "o1", title: "Out1" } });
      if (url.includes("/o2")) return Promise.resolve({ document: { id: "o2", title: "Out2" } });
      return Promise.resolve([]);
    }));

    const { result } = renderHook(() => useLinkGraph({ docId: "d1", title: "Title", previewContent: "[[Out1]] [[Out2]]" }));
    await waitFor(() => { expect(result.current.outboundLinks).toHaveLength(2); });
  });

  it("linkGraph has current node", async () => {
    mockApiFetch.mockResolvedValue([]);
    const { result } = renderHook(() => useLinkGraph({ docId: "d1", title: "My Doc", previewContent: "" }));
    await waitFor(() => { expect(result.current.linkGraph.nodes).toHaveLength(1); });
    expect(result.current.linkGraph.nodes[0]).toEqual(expect.objectContaining({ id: "d1", kind: "current" }));
  });

  it("linkGraph computes incoming-only nodes", async () => {
    const backlinks = [{ id: "b1", title: "BL" }];
    mockApiFetch.mockResolvedValue(backlinks);
    stableExtract.mockReturnValue([]);

    const { result } = renderHook(() => useLinkGraph({ docId: "d1", title: "Title", previewContent: "" }));
    await waitFor(() => { expect(result.current.linkGraph.nodes).toHaveLength(2); });
    const incoming = result.current.linkGraph.nodes.find(n => n.kind === "incoming");
    expect(incoming?.id).toBe("b1");
  });

  it("linkGraph computes outgoing-only nodes", async () => {
    stableExtract.mockReturnValue(["o1"]);
    mockApiFetch.mockImplementation(((url: string) => {
      if (url.includes("/backlinks")) return Promise.resolve([]);
      return Promise.resolve({ document: { id: "o1", title: "Out1" } });
    }));

    const { result } = renderHook(() => useLinkGraph({ docId: "d1", title: "Title", previewContent: "[[Out1]]" }));
    await waitFor(() => {
      const outgoing = result.current.linkGraph.nodes.find(n => n.kind === "outgoing");
      expect(outgoing?.id).toBe("o1");
    });
  });

  it("linkGraph computes both nodes when a doc is in backlinks and outbound", async () => {
    stableExtract.mockReturnValue(["b1"]);
    mockApiFetch.mockImplementation(((url: string) => {
      if (url.includes("/backlinks")) return Promise.resolve([{ id: "b1", title: "Both" }]);
      return Promise.resolve({ document: { id: "b1", title: "Both" } });
    }));

    const { result } = renderHook(() => useLinkGraph({ docId: "d1", title: "Title", previewContent: "[[Both]]" }));
    await waitFor(() => {
      const both = result.current.linkGraph.nodes.find(n => n.kind === "both");
      expect(both?.id).toBe("b1");
    });
  });
});
