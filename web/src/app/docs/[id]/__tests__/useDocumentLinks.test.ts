import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/doc-editor.service", () => ({
  docEditorService: {
    getDocumentLinks: vi.fn(),
  },
}));

import { docEditorService } from "../services/doc-editor.service";
import {
  linkedDocumentIDSetsEqual,
  useDocumentLinks,
} from "../hooks/useDocumentLinks";
import type { DocumentLinksResponse } from "../types";

const getDocumentLinks = vi.mocked(docEditorService.getDocumentLinks);

function response(
  overrides: Partial<DocumentLinksResponse> = {},
): DocumentLinksResponse {
  return {
    counts: { incoming: 1, outgoing: 1, unique: 2 },
    incoming: {
      items: [
        { id: "incoming-1", title: "Incoming", mtime: 3, mutual: false },
      ],
      next_cursor: "",
    },
    outgoing: {
      items: [
        { id: "outgoing-1", title: "Outgoing", mtime: 2, mutual: true },
      ],
      next_cursor: "",
    },
    ...overrides,
  };
}

function renderLinks(
  overrides: Partial<Parameters<typeof useDocumentLinks>[0]> = {},
) {
  return renderHook(
    (props) => useDocumentLinks(props),
    {
      initialProps: {
        docId: "doc-1",
        previewContent: "",
        savedContent: "",
        serverRevision: 1,
        ...overrides,
      },
    },
  );
}

beforeEach(() => {
  getDocumentLinks.mockReset();
  getDocumentLinks.mockResolvedValue(response());
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useDocumentLinks", () => {
  it("loads on mount and reuses fresh cached data when opened", async () => {
    const { result } = renderLinks();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.counts?.unique).toBe(2);
    expect(result.current.incoming[0]?.id).toBe("incoming-1");
    expect(getDocumentLinks).toHaveBeenCalledWith(
      "doc-1",
      { include: ["incoming", "outgoing"], limit: 20 },
      expect.any(AbortSignal),
    );

    act(() => {
      result.current.openPanel();
      result.current.closePanel();
      result.current.openPanel();
    });
    expect(getDocumentLinks).toHaveBeenCalledTimes(1);
  });

  it("refreshes stale cached data without replacing it on failure", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(1_000);
    getDocumentLinks.mockResolvedValueOnce(response());
    const { result } = renderLinks();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    act(() => result.current.openPanel());

    getDocumentLinks.mockRejectedValueOnce(new Error("offline"));
    vi.advanceTimersByTime(61_000);
    act(() => {
      result.current.closePanel();
      result.current.openPanel();
    });
    await waitFor(() => expect(result.current.refreshError).toBe(true));
    expect(result.current.status).toBe("ready");
    expect(result.current.incoming[0]?.id).toBe("incoming-1");
  });

  it("retries an initial failure", async () => {
    getDocumentLinks
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(response());
    const { result } = renderLinks();
    await waitFor(() => expect(result.current.status).toBe("error"));

    await act(async () => result.current.retry());
    expect(result.current.status).toBe("ready");
    expect(getDocumentLinks).toHaveBeenCalledTimes(2);
  });

  it("loads one direction at a time and removes duplicate rows", async () => {
    getDocumentLinks
      .mockResolvedValueOnce(
        response({
          incoming: {
            items: [
              { id: "incoming-1", title: "First", mtime: 3, mutual: false },
            ],
            next_cursor: "next-incoming",
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          incoming: {
            items: [
              { id: "incoming-1", title: "Duplicate", mtime: 3, mutual: false },
              { id: "incoming-2", title: "Second", mtime: 2, mutual: true },
            ],
            next_cursor: "",
          },
          outgoing: undefined,
        }),
      );
    const { result } = renderLinks();
    act(() => result.current.openPanel());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => result.current.loadMore("incoming"));
    expect(getDocumentLinks).toHaveBeenLastCalledWith(
      "doc-1",
      {
        include: ["incoming"],
        limit: 20,
        incomingCursor: "next-incoming",
      },
      expect.any(AbortSignal),
    );
    expect(result.current.incoming.map((item) => item.id)).toEqual([
      "incoming-1",
      "incoming-2",
    ]);
  });

  it("keeps both directions when load more fails and supports retry", async () => {
    getDocumentLinks
      .mockResolvedValueOnce(
        response({
          incoming: {
            items: [
              { id: "incoming-1", title: "First", mtime: 3, mutual: false },
            ],
            next_cursor: "next-incoming",
          },
        }),
      )
      .mockRejectedValueOnce(new Error("page failed"))
      .mockResolvedValueOnce(
        response({
          incoming: {
            items: [
              { id: "incoming-2", title: "Second", mtime: 2, mutual: false },
            ],
            next_cursor: "",
          },
          outgoing: undefined,
        }),
      );
    const { result } = renderLinks();
    act(() => result.current.openPanel());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => result.current.loadMore("incoming"));
    expect(result.current.loadMoreError).toBe("incoming");
    expect(result.current.outgoing[0]?.id).toBe("outgoing-1");
    await act(async () => result.current.loadMore("incoming"));
    expect(result.current.loadMoreError).toBeNull();
    expect(result.current.incoming.map((item) => item.id)).toEqual([
      "incoming-1",
      "incoming-2",
    ]);
  });

  it("ignores a canceled request and a late response from an older request ID", async () => {
    let resolveFirst: ((value: DocumentLinksResponse) => void) | undefined;
    getDocumentLinks
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(
        response({ counts: { incoming: 2, outgoing: 2, unique: 4 } }),
      );
    const { result } = renderLinks();
    act(() => result.current.openPanel());
    const firstSignal = getDocumentLinks.mock.calls[0]?.[2];
    await act(async () => result.current.retry());
    expect(firstSignal?.aborted).toBe(true);
    expect(result.current.counts?.unique).toBe(4);

    await act(async () => {
      resolveFirst?.(response());
    });
    expect(result.current.counts?.unique).toBe(4);
    expect(result.current.refreshError).toBe(false);
  });

  it("aborts an obsolete request and discards its result on document change", async () => {
    let resolveFirst: ((value: DocumentLinksResponse) => void) | undefined;
    getDocumentLinks
      .mockImplementationOnce(
        (_id, _query, signal) =>
          new Promise((resolve) => {
            resolveFirst = resolve;
            expect(signal?.aborted).toBe(false);
          }),
      )
      .mockResolvedValueOnce(response());
    const { result, rerender } = renderLinks();
    const firstSignal = getDocumentLinks.mock.calls[0]?.[2];

    rerender({
      docId: "doc-2",
      previewContent: "",
      savedContent: "",
      serverRevision: 1,
    });
    expect(firstSignal?.aborted).toBe(true);
    expect(result.current.open).toBe(false);
    act(() => resolveFirst?.(response()));
    expect(result.current.counts).toBeNull();

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(getDocumentLinks).toHaveBeenLastCalledWith(
      "doc-2",
      expect.any(Object),
      expect.any(AbortSignal),
    );
  });

  it("refreshes the loaded count after a saved revision changes while closed", async () => {
    getDocumentLinks
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(
        response({ counts: { incoming: 2, outgoing: 1, unique: 3 } }),
      );
    const { result, rerender } = renderLinks();
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.open).toBe(false);

    rerender({
      docId: "doc-1",
      previewContent: "",
      savedContent: "",
      serverRevision: 2,
    });
    await waitFor(() => expect(result.current.counts?.unique).toBe(3));
    expect(getDocumentLinks).toHaveBeenCalledTimes(2);
  });

  it("restarts initial loading when a save completes", async () => {
    let resolveFirst: ((value: DocumentLinksResponse) => void) | undefined;
    getDocumentLinks
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(
        response({
          incoming: {
            items: [
              { id: "fresh", title: "Fresh", mtime: 4, mutual: false },
            ],
            next_cursor: "",
          },
        }),
      );
    const { result, rerender } = renderLinks();
    const firstSignal = getDocumentLinks.mock.calls[0]?.[2];

    rerender({
      docId: "doc-1",
      previewContent: "",
      savedContent: "",
      serverRevision: 2,
    });

    await waitFor(() => expect(getDocumentLinks).toHaveBeenCalledTimes(2));
    expect(firstSignal?.aborted).toBe(true);
    await waitFor(() => expect(result.current.incoming[0]?.id).toBe("fresh"));
    act(() => resolveFirst?.(response()));
    expect(result.current.incoming[0]?.id).toBe("fresh");
  });

  it("compares saved and draft link targets as sets", () => {
    expect(linkedDocumentIDSetsEqual(["a", "b"], ["b", "a"])).toBe(true);
    expect(linkedDocumentIDSetsEqual(["a", "a"], ["a"])).toBe(true);
    expect(linkedDocumentIDSetsEqual(["a"], ["a", "b"])).toBe(false);

    const { result, rerender } = renderLinks({
      previewContent: "[one](/docs/a) [two](/docs/b)",
      savedContent: "[two](/docs/b) [one](/docs/a)",
    });
    expect(result.current.hasDraftLinkChanges).toBe(false);
    rerender({
      docId: "doc-1",
      previewContent: "[one](/docs/a)",
      savedContent: "[two](/docs/b)",
      serverRevision: 1,
    });
    expect(result.current.hasDraftLinkChanges).toBe(true);
    rerender({
      docId: "doc-1",
      previewContent: "[one](/docs/a) changed prose",
      savedContent: "[one](/docs/a) old prose",
      serverRevision: 1,
    });
    expect(result.current.hasDraftLinkChanges).toBe(false);
  });

  it("distinguishes not loaded from a loaded zero count", async () => {
    getDocumentLinks.mockResolvedValue(
      response({
        counts: { incoming: 0, outgoing: 0, unique: 0 },
        incoming: { items: [], next_cursor: "" },
        outgoing: { items: [], next_cursor: "" },
      }),
    );
    const { result } = renderLinks();
    expect(result.current.loaded).toBe(false);
    expect(result.current.counts).toBeNull();
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.counts?.unique).toBe(0);
  });
});
