import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Asset } from "@/types";

import {
  AssetPreviewError,
  probeAssetPreview,
  useAssetPreview,
} from "../hooks/useAssetPreview";
import { PDF_PREVIEW_MAX_BYTES } from "../helpers";

const makeAsset = (overrides: Partial<Asset> = {}): Asset => ({
  id: "asset-1",
  user_id: "user-1",
  file_key: "manual.pdf",
  url: "https://s3.example.test/bucket/manual.pdf",
  name: "manual.pdf",
  content_type: "application/pdf",
  size: 1024,
  ctime: 0,
  mtime: 0,
  ref_count: 0,
  ...overrides,
});

function headResponse({
  status = 200,
  contentType = "application/pdf",
  contentLength = "1024",
}: {
  status?: number;
  contentType?: string;
  contentLength?: string | null;
} = {}) {
  const headers = new Headers({ "Content-Type": contentType });
  if (contentLength !== null) headers.set("Content-Length", contentLength);
  return new Response(null, { status, headers });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headResponse()));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("probeAssetPreview", () => {
  it("uses a credential-free cancellable HEAD and returns normalized metadata", async () => {
    const controller = new AbortController();
    const result = await probeAssetPreview(
      "/api/v1/files/manual.pdf/preview",
      "pdf",
      controller.signal,
    );

    expect(result).toEqual({ contentType: "application/pdf", size: 1024 });
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/files/manual.pdf/preview",
      {
        method: "HEAD",
        signal: controller.signal,
        credentials: "omit",
      },
    );
  });

  it.each([
    [404, "not_found"],
    [413, "too_large"],
    [415, "unsupported"],
    [500, "invalid_response"],
  ] as const)("maps HTTP %s to %s", async (status, code) => {
    vi.mocked(fetch).mockResolvedValueOnce(headResponse({ status }));
    await expect(probeAssetPreview(
      "/preview", "pdf", new AbortController().signal,
    )).rejects.toEqual(expect.objectContaining({ code }));
  });

  it("rejects MIME mismatch and invalid content length", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(headResponse({ contentType: "text/html" }));
    await expect(probeAssetPreview(
      "/preview", "pdf", new AbortController().signal,
    )).rejects.toEqual(expect.objectContaining({ code: "invalid_response" }));

    vi.mocked(fetch).mockResolvedValueOnce(headResponse({ contentLength: null }));
    await expect(probeAssetPreview(
      "/preview", "pdf", new AbortController().signal,
    )).rejects.toEqual(expect.objectContaining({ code: "invalid_response" }));
  });

  it("enforces the PDF size boundary before loading PDF.js", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(headResponse({
      contentLength: String(PDF_PREVIEW_MAX_BYTES),
    }));
    await expect(probeAssetPreview(
      "/preview", "pdf", new AbortController().signal,
    )).resolves.toHaveProperty("size", PDF_PREVIEW_MAX_BYTES);

    vi.mocked(fetch).mockResolvedValueOnce(headResponse({
      contentLength: String(PDF_PREVIEW_MAX_BYTES + 1),
    }));
    await expect(probeAssetPreview(
      "/preview", "pdf", new AbortController().signal,
    )).rejects.toEqual(expect.objectContaining({ code: "too_large" }));
  });

  it("preserves aborts and hides other network errors", async () => {
    const abort = new DOMException("aborted", "AbortError");
    vi.mocked(fetch).mockRejectedValueOnce(abort);
    await expect(probeAssetPreview(
      "/preview", "pdf", new AbortController().signal,
    )).rejects.toBe(abort);

    vi.mocked(fetch).mockRejectedValueOnce(new Error("secret provider error"));
    await expect(probeAssetPreview(
      "/preview", "pdf", new AbortController().signal,
    )).rejects.toEqual(new AssetPreviewError("network"));
  });
});

describe("useAssetPreview", () => {
  it("checks media and becomes ready without using the asset URL", async () => {
    const asset = makeAsset();
    const { result } = renderHook(() => useAssetPreview(asset));
    expect(result.current.state.status).toBe("checking");

    await waitFor(() => { expect(result.current.state.status).toBe("ready"); });
    expect(result.current.kind).toBe("pdf");
    expect(result.current.previewURL).toBe("/api/v1/files/manual.pdf/preview");
    expect(result.current.size).toBe(1024);
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/files/manual.pdf/preview",
      expect.objectContaining({ method: "HEAD" }),
    );
  });

  it("does not probe images, unsupported assets, or unsafe keys", async () => {
    const image = makeAsset({
      file_key: "image.png",
      name: "image.png",
      content_type: "image/png",
    });
    const imageHook = renderHook(() => useAssetPreview(image));
    expect(imageHook.result.current.state.status).toBe("ready");

    const unsupportedHook = renderHook(() => useAssetPreview(makeAsset({
      file_key: "file.html",
      name: "file.html",
      content_type: "text/html",
    })));
    expect(unsupportedHook.result.current.state.status).toBe("unsupported");

    const unsafeHook = renderHook(() => useAssetPreview(makeAsset({
      file_key: "https://evil.test/manual.pdf",
    })));
    await waitFor(() => {
      expect(unsafeHook.result.current.state.status).toBe("unsupported");
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("retries after a stable error", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(headResponse({ status: 404 }))
      .mockResolvedValueOnce(headResponse());
    const { result } = renderHook(() => useAssetPreview(makeAsset()));
    await waitFor(() => {
      expect(result.current.state).toEqual({ status: "error", error: "not_found" });
    });

    act(() => { result.current.retry(); });
    await waitFor(() => { expect(result.current.state.status).toBe("ready"); });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("aborts stale checks and ignores their eventual result", async () => {
    let resolveFirst: ((response: Response) => void) | undefined;
    vi.mocked(fetch)
      .mockImplementationOnce((_url, init) => new Promise<Response>((resolve, reject) => {
        resolveFirst = resolve;
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      }))
      .mockResolvedValueOnce(headResponse({
        contentType: "video/mp4",
        contentLength: "2048",
      }));
    const first = makeAsset();
    const second = makeAsset({
      id: "asset-2",
      file_key: "movie.mp4",
      name: "movie.mp4",
      content_type: "video/mp4",
    });
    const { result, rerender } = renderHook(
      ({ asset }: { asset: Asset }) => useAssetPreview(asset),
      { initialProps: { asset: first } },
    );
    rerender({ asset: second });
    await waitFor(() => {
      expect(result.current.state.status).toBe("ready");
      expect(result.current.kind).toBe("video");
    });

    resolveFirst?.(headResponse());
    await act(async () => { await Promise.resolve(); });
    expect(result.current.kind).toBe("video");
    expect(result.current.size).toBe(2048);
  });

  it("aborts the active request on unmount", () => {
    let signal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementationOnce((_url, init) => {
      signal = init?.signal || undefined;
      return new Promise<Response>(() => undefined);
    });
    const { unmount } = renderHook(() => useAssetPreview(makeAsset()));
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
