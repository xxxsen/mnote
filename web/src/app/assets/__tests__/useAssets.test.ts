import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  resolveAPIURL: (endpoint: string) => `/api/v1${endpoint}`,
}));
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: vi.fn() }));

import { apiFetch } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";
import type { Asset } from "@/types";

import { useAssets } from "../hooks/useAssets";

const mockApiFetch = vi.mocked(apiFetch);
const mockCopy = vi.mocked(copyToClipboard);
const toast = vi.fn();

const makeAsset = (overrides: Partial<Asset> = {}): Asset => ({
  id: "asset-1",
  user_id: "user-1",
  file_key: "file-1",
  url: "/uploads/image.png",
  name: "image.png",
  content_type: "image/png",
  size: 1024,
  ctime: 0,
  mtime: 0,
  ref_count: 0,
  ...overrides,
});

function mockCatalog(items: Asset[] = [makeAsset()]) {
  mockApiFetch.mockImplementation((endpoint) => {
    if (endpoint.startsWith("/assets?")) return Promise.resolve(items);
    if (endpoint.includes("/references")) return Promise.resolve([]);
    return Promise.resolve({});
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCatalog();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("useAssets", () => {
  it("loads 40-item pages and keeps mobile on the list after initial selection", async () => {
    const { result } = renderHook(() => useAssets(toast));
    await waitFor(() => { expect(result.current.loading).toBe(false); });

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining("limit=40"),
      expect.anything(),
    );
    expect(result.current.selected?.id).toBe("asset-1");
    expect(result.current.mobileDetailOpen).toBe(false);
  });

  it("opens and closes mobile detail only after an explicit selection", async () => {
    const { result } = renderHook(() => useAssets(toast));
    await waitFor(() => { expect(result.current.loading).toBe(false); });

    act(() => { result.current.selectAsset("asset-1"); });
    expect(result.current.mobileDetailOpen).toBe(true);
    act(() => { result.current.closeMobileDetail(); });
    expect(result.current.mobileDetailOpen).toBe(false);
  });

  it("debounces server search for 250ms and resets pagination", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockCatalog([]);
    const { result } = renderHook(() => useAssets(toast));
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    mockApiFetch.mockClear();
    mockCatalog([]);

    act(() => { result.current.setSearch("diagram"); });
    await act(async () => { await vi.advanceTimersByTimeAsync(249); });
    expect(mockApiFetch).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining("q=diagram"),
        expect.anything(),
      );
    });
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.stringContaining("offset=0"),
      expect.anything(),
    );
  });

  it("paginates and deduplicates overlapping assets", async () => {
    const first = Array.from({ length: 40 }, (_, index) => makeAsset({ id: `asset-${index}` }));
    mockCatalog(first);
    const { result } = renderHook(() => useAssets(toast));
    await waitFor(() => { expect(result.current.assets).toHaveLength(40); });
    mockApiFetch.mockImplementation((endpoint) => {
      if (endpoint.startsWith("/assets?")) {
        return Promise.resolve([
          makeAsset({ id: "asset-0" }),
          makeAsset({ id: "asset-40" }),
        ]);
      }
      return Promise.resolve([]);
    });

    await act(async () => { result.current.loadMore(); });
    await waitFor(() => { expect(result.current.loadingMore).toBe(false); });

    expect(result.current.assets).toHaveLength(41);
  });

  it("keeps list data when incremental loading fails", async () => {
    const first = Array.from({ length: 40 }, (_, index) => makeAsset({ id: `asset-${index}` }));
    mockCatalog(first);
    const { result } = renderHook(() => useAssets(toast));
    await waitFor(() => { expect(result.current.assets).toHaveLength(40); });
    mockApiFetch.mockRejectedValueOnce(new Error("offline"));

    await act(async () => { result.current.loadMore(); });
    await waitFor(() => { expect(result.current.loadMoreError).toBe(true); });

    expect(result.current.assets).toHaveLength(40);
  });

  it("exposes reference errors separately and can retry", async () => {
    mockApiFetch.mockImplementation((endpoint) => {
      if (endpoint.startsWith("/assets?")) return Promise.resolve([makeAsset()]);
      return Promise.reject(new Error("offline"));
    });
    const { result } = renderHook(() => useAssets(toast));
    await waitFor(() => { expect(result.current.referencesError).toBe(true); });
    expect(result.current.initialError).toBe(false);

    mockApiFetch.mockResolvedValueOnce([
      { document_id: "doc-1", title: "Reference", mtime: 1 },
    ]);
    await act(async () => { await result.current.retryReferences(); });

    expect(result.current.references).toHaveLength(1);
    expect(result.current.referencesError).toBe(false);
  });

  it("reports clipboard rejection and preserves the exact requested value", async () => {
    mockCopy.mockResolvedValue(false);
    const { result } = renderHook(() => useAssets(toast));
    await waitFor(() => { expect(result.current.selected).not.toBeNull(); });

    await act(async () => { await result.current.copyURL(); });
    await waitFor(() => { expect(mockCopy).toHaveBeenCalledWith("/api/v1/files/file-1"); });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" }));

    mockCopy.mockResolvedValue(true);
    await act(async () => { await result.current.copyMarkdown(); });
    await waitFor(() => {
      expect(mockCopy).toHaveBeenCalledWith("![image.png](/api/v1/files/file-1)");
    });
  });

  it("never copies an S3 public URL when a file key is available", async () => {
    mockCatalog([makeAsset({
      file_key: "safe-file.pdf",
      url: "https://s3.example.test/bucket/private-path.pdf",
      name: "private-path.pdf",
      content_type: "application/pdf",
    })]);
    mockCopy.mockResolvedValue(true);
    const { result } = renderHook(() => useAssets(toast));
    await waitFor(() => { expect(result.current.selected).not.toBeNull(); });

    await act(async () => { await result.current.copyURL(); });
    expect(mockCopy).toHaveBeenLastCalledWith("/api/v1/files/safe-file.pdf");
    await act(async () => { await result.current.copyMarkdown(); });
    expect(mockCopy).toHaveBeenLastCalledWith(
      "![private-path.pdf](/api/v1/files/safe-file.pdf)",
    );
  });
});
