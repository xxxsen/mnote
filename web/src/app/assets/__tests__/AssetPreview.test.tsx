import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Asset } from "@/types";

const pdfMocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  workerOptions: { workerSrc: "" },
}));

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: pdfMocks.workerOptions,
  getDocument: pdfMocks.getDocument,
}));

import { AssetPreview } from "../components/AssetPreview";

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

function headResponse(
  contentType: string,
  status = 200,
  contentLength = "1024",
) {
  return new Response(null, {
    status,
    headers: {
      "Content-Type": contentType,
      "Content-Length": contentLength,
    },
  });
}

function mockPDFDocument() {
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
    }),
    render: vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() })),
    cleanup: vi.fn(),
  };
  const document = {
    numPages: 2,
    getPage: vi.fn(() => Promise.resolve(page)),
    destroy: vi.fn(() => Promise.resolve()),
  };
  pdfMocks.getDocument.mockReturnValue({
    promise: Promise.resolve(document),
    destroy: vi.fn(() => Promise.resolve()),
    onPassword: undefined,
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({} as CanvasRenderingContext2D);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  mockPDFDocument();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  pdfMocks.getDocument.mockReset();
});

describe("AssetPreview", () => {
  it("keeps compact PDF, video, and audio request-free", () => {
    const { rerender, container } = render(
      <AssetPreview asset={makeAsset()} compact />,
    );
    expect(screen.getByText("PDF")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelector("canvas, iframe, object, embed, video, audio")).toBeNull();

    rerender(<AssetPreview asset={makeAsset({
      file_key: "movie.mp4",
      name: "movie.mp4",
      content_type: "video/mp4",
    })} compact />);
    expect(screen.getByText("VIDEO")).toBeTruthy();
    rerender(<AssetPreview asset={makeAsset({
      file_key: "track.mp3",
      name: "track.mp3",
      content_type: "audio/mpeg",
    })} compact />);
    expect(screen.getByText("AUDIO")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("mounts a metadata-only non-autoplaying video after HEAD succeeds", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(headResponse("video/mp4"));
    const { container } = render(<AssetPreview asset={makeAsset({
      file_key: "movie.mp4",
      name: "movie.mp4",
      content_type: "video/mp4",
    })} />);

    const video = await waitFor(() => {
      const element = container.querySelector("video");
      expect(element).toBeTruthy();
      return element as HTMLVideoElement;
    });
    expect(video.getAttribute("src")).toBe("/api/v1/files/movie.mp4/preview");
    expect(video.controls).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.preload).toBe("metadata");
    expect(video.autoplay).toBe(false);
    expect(video.loop).toBe(false);
    fireEvent.loadedMetadata(video);
    expect(screen.queryByText("Preparing preview…")).toBeNull();
  });

  it("mounts a metadata-only non-autoplaying audio element", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(headResponse("audio/mpeg"));
    const { container } = render(<AssetPreview asset={makeAsset({
      file_key: "track.mp3",
      name: "track.mp3",
      content_type: "audio/mpeg",
    })} />);

    const audio = await waitFor(() => {
      const element = container.querySelector("audio");
      expect(element).toBeTruthy();
      return element as HTMLAudioElement;
    });
    expect(audio.getAttribute("src")).toBe("/api/v1/files/track.mp3/preview");
    expect(audio.controls).toBe(true);
    expect(audio.preload).toBe("metadata");
    expect(audio.autoplay).toBe(false);
  });

  it("renders PDF to Canvas without dangerous embedding elements", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(headResponse("application/pdf"));
    const { container } = render(<AssetPreview asset={makeAsset()} />);

    await waitFor(() => {
      expect(container.querySelector("canvas")).toBeTruthy();
      expect(pdfMocks.getDocument).toHaveBeenCalled();
    });
    expect(container.querySelector("iframe, object, embed")).toBeNull();
    expect(pdfMocks.getDocument).toHaveBeenCalledWith(expect.objectContaining({
      url: "/api/v1/files/manual.pdf/preview",
      withCredentials: false,
      isEvalSupported: false,
      enableXfa: false,
    }));
  });

  it("shows a stable retry and application download URL on HEAD failure", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(headResponse("application/pdf", 404))
      .mockResolvedValueOnce(headResponse("application/pdf"));
    render(<AssetPreview asset={makeAsset()} />);

    await waitFor(() => {
      expect(screen.getByText("The file could not be found.")).toBeTruthy();
    });
    const open = screen.getByRole("link", { name: /Open file/ });
    expect(open.getAttribute("href")).toBe("/api/v1/files/manual.pdf");

    fireEvent.click(screen.getByRole("button", { name: "Retry preview" }));
    await waitFor(() => {
      expect(pdfMocks.getDocument).toHaveBeenCalled();
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps unsupported content out of the preview pipeline", () => {
    const { container } = render(<AssetPreview asset={makeAsset({
      file_key: "unsafe.html",
      name: "unsafe.pdf",
      content_type: "text/html",
    })} />);
    expect(screen.getByText("No preview available")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    expect(container.querySelector("iframe, object, embed, video, audio, canvas")).toBeNull();
  });
});
