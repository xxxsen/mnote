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

import { PDFAssetPreview } from "../components/PDFAssetPreview";
import {
  PDF_PREVIEW_MAX_PAGES,
  PDF_PREVIEW_MAX_RENDER_PIXELS,
  PDF_PREVIEW_MAX_RENDER_SIDE,
} from "../helpers";

const asset: Asset = {
  id: "asset-1",
  user_id: "user-1",
  file_key: "manual.pdf",
  url: "https://s3.example.test/manual.pdf",
  name: "manual.pdf",
  content_type: "application/pdf",
  size: 1024,
  ctime: 0,
  mtime: 0,
  ref_count: 0,
};

function createPDF({
  pages = 2,
  width = 600,
  height = 800,
  renderPromise = Promise.resolve(),
}: {
  pages?: number;
  width?: number;
  height?: number;
  renderPromise?: Promise<void>;
} = {}) {
  const renderTask = {
    promise: renderPromise,
    cancel: vi.fn(),
  };
  const page = {
    getViewport: vi.fn(({ scale }: { scale: number }) => ({
      width: width * scale,
      height: height * scale,
    })),
    render: vi.fn((_parameters?: unknown) => renderTask),
    cleanup: vi.fn(),
  };
  const document = {
    numPages: pages,
    getPage: vi.fn(() => Promise.resolve(page)),
    destroy: vi.fn(() => Promise.resolve()),
  };
  const loadingTask = {
    promise: Promise.resolve(document),
    destroy: vi.fn(() => Promise.resolve()),
    onPassword: undefined as undefined | (() => void),
  };
  pdfMocks.getDocument.mockReturnValue(loadingTask);
  return { document, loadingTask, page, renderTask };
}

function renderPreview(onRetry = vi.fn()) {
  return render(
    <PDFAssetPreview
      asset={asset}
      previewURL="/api/v1/files/manual.pdf/preview"
      downloadURL="/api/v1/files/manual.pdf"
      onRetry={onRetry}
    />,
  );
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue({} as CanvasRenderingContext2D);
  Object.defineProperty(window, "devicePixelRatio", {
    configurable: true,
    value: 1,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  pdfMocks.getDocument.mockReset();
  pdfMocks.workerOptions.workerSrc = "";
});

describe("PDFAssetPreview", () => {
  it("uses the locked-down display API and renders only a Canvas", async () => {
    const fixture = createPDF();
    const { container } = renderPreview();

    await waitFor(() => {
      expect(fixture.page.render).toHaveBeenCalled();
      expect(screen.getByRole("img", { name: "Page 1 of 2: manual.pdf" })).toBeTruthy();
    });
    expect(pdfMocks.getDocument).toHaveBeenCalledWith({
      url: "/api/v1/files/manual.pdf/preview",
      withCredentials: false,
      isEvalSupported: false,
      enableXfa: false,
      stopAtErrors: true,
      maxImageSize: PDF_PREVIEW_MAX_RENDER_PIXELS,
      canvasMaxAreaInBytes: PDF_PREVIEW_MAX_RENDER_PIXELS * 4,
      rangeChunkSize: 64 * 1024,
      disableRange: false,
      disableStream: false,
      disableAutoFetch: false,
      cMapUrl: "/pdfjs/cmaps/",
      cMapPacked: true,
      verbosity: 0,
    });
    expect(pdfMocks.workerOptions.workerSrc).toContain("pdf.worker.min.mjs");
    expect(fixture.page.render).toHaveBeenCalledWith(expect.objectContaining({
      annotationMode: 0,
      background: "#ffffff",
      canvas: expect.any(HTMLCanvasElement),
    }));
    expect(fixture.page.render.mock.calls[0]?.[0]).not.toHaveProperty("canvasContext");
    expect(container.querySelector("iframe, object, embed")).toBeNull();
    expect(container.querySelector("[dangerouslySetInnerHTML]")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });

  it("supports page navigation, keyboard shortcuts, and bounded zoom", async () => {
    const fixture = createPDF({ pages: 3 });
    renderPreview();
    await waitFor(() => { expect(fixture.page.render).toHaveBeenCalled(); });

    fireEvent.click(screen.getByRole("button", { name: "Next PDF page" }));
    await waitFor(() => { expect(fixture.document.getPage).toHaveBeenCalledWith(2); });
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();

    const section = screen.getByRole("region", { name: "PDF preview: manual.pdf" });
    fireEvent.keyDown(section, { key: "PageDown" });
    await waitFor(() => { expect(fixture.document.getPage).toHaveBeenCalledWith(3); });
    fireEvent.keyDown(section, { key: "PageUp" });
    await waitFor(() => { expect(screen.getByText("Page 2 of 3")).toBeTruthy(); });

    const zoomIn = screen.getByRole("button", { name: "Zoom in PDF" });
    for (let index = 0; index < 8; index += 1) fireEvent.click(zoomIn);
    expect(screen.getByText("200%")).toBeTruthy();
    expect((zoomIn as HTMLButtonElement).disabled).toBe(true);
    const zoomOut = screen.getByRole("button", { name: "Zoom out PDF" });
    for (let index = 0; index < 8; index += 1) fireEvent.click(zoomOut);
    expect(screen.getByText("50%")).toBeTruthy();
    expect((zoomOut as HTMLButtonElement).disabled).toBe(true);
  });

  it("caps DPR, Canvas area, and each Canvas side before allocation", async () => {
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 4,
    });
    const fixture = createPDF({ width: 100_000, height: 10_000 });
    const { container } = renderPreview();

    await waitFor(() => { expect(fixture.page.render).toHaveBeenCalled(); });
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(canvas.width).toBeLessThanOrEqual(PDF_PREVIEW_MAX_RENDER_SIDE);
    expect(canvas.height).toBeLessThanOrEqual(PDF_PREVIEW_MAX_RENDER_SIDE);
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(PDF_PREVIEW_MAX_RENDER_PIXELS);
    const displayWidth = Number.parseFloat(canvas.style.width);
    const displayHeight = Number.parseFloat(canvas.style.height);
    expect(displayWidth).toBeLessThanOrEqual(PDF_PREVIEW_MAX_RENDER_SIDE);
    expect(displayHeight).toBeLessThanOrEqual(PDF_PREVIEW_MAX_RENDER_SIDE);
    expect(displayWidth * displayHeight).toBeLessThanOrEqual(PDF_PREVIEW_MAX_RENDER_PIXELS);
  });

  it("accepts the exact page limit and caps device pixel ratio at two", async () => {
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 4,
    });
    const fixture = createPDF({ pages: PDF_PREVIEW_MAX_PAGES });
    const { container } = renderPreview();

    await waitFor(() => { expect(fixture.page.render).toHaveBeenCalled(); });
    const canvas = container.querySelector("canvas") as HTMLCanvasElement;
    expect(screen.getByText(`Page 1 of ${PDF_PREVIEW_MAX_PAGES}`)).toBeTruthy();
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(1600);
    expect(fixture.document.destroy).not.toHaveBeenCalled();
  });

  it("rejects documents beyond the page limit and destroys them", async () => {
    const fixture = createPDF({ pages: PDF_PREVIEW_MAX_PAGES + 1 });
    renderPreview();

    await waitFor(() => {
      expect(screen.getByText("PDF exceeds preview limits")).toBeTruthy();
    });
    expect(fixture.document.destroy).toHaveBeenCalled();
    expect(fixture.document.getPage).not.toHaveBeenCalled();
  });

  it("does not collect passwords and destroys an encrypted loading task", async () => {
    const loadingTask = {
      promise: new Promise<never>(() => undefined),
      destroy: vi.fn(() => Promise.resolve()),
      onPassword: undefined as undefined | (() => void),
    };
    pdfMocks.getDocument.mockReturnValue(loadingTask);
    renderPreview();
    await waitFor(() => { expect(loadingTask.onPassword).toBeTypeOf("function"); });

    loadingTask.onPassword?.();
    await waitFor(() => {
      expect(screen.getByText("Password-protected PDF cannot be previewed")).toBeTruthy();
    });
    expect(loadingTask.destroy).toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("cancels an active render and destroys the document on unmount", async () => {
    const fixture = createPDF({ renderPromise: new Promise<void>(() => undefined) });
    const view = renderPreview();
    await waitFor(() => { expect(fixture.page.render).toHaveBeenCalled(); });

    fireEvent.click(screen.getByRole("button", { name: "Zoom in PDF" }));
    await waitFor(() => { expect(fixture.renderTask.cancel).toHaveBeenCalled(); });
    view.unmount();
    expect(fixture.document.destroy).toHaveBeenCalled();
  });

  it("maps invalid documents to a stable error with retry and safe download", async () => {
    const invalid = Object.assign(new Error("parser detail"), { name: "InvalidPDFException" });
    pdfMocks.getDocument.mockReturnValue({
      promise: Promise.reject(invalid),
      destroy: vi.fn(() => Promise.resolve()),
      onPassword: undefined,
    });
    const retry = vi.fn();
    renderPreview(retry);

    await waitFor(() => { expect(screen.getByText("PDF preview unavailable")).toBeTruthy(); });
    fireEvent.click(screen.getByRole("button", { name: "Retry preview" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: /Open file/ }).getAttribute("href"))
      .toBe("/api/v1/files/manual.pdf");
  });
});
