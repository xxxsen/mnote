"use client";

import type {
  getDocument as getPDFDocument,
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from "pdfjs-dist";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import type { Asset } from "@/types";

import {
  PDF_PREVIEW_MAX_PAGES,
  PDF_PREVIEW_MAX_RENDER_PIXELS,
  PDF_PREVIEW_MAX_RENDER_SIDE,
  PDF_PREVIEW_MAX_ZOOM,
  PDF_PREVIEW_MIN_ZOOM,
  PDF_PREVIEW_ZOOM_STEP,
} from "../helpers";
import type { AssetPreviewErrorCode } from "../hooks/useAssetPreview";
import { AssetPreviewFailure, AssetPreviewLoading } from "./AssetPreviewState";
import { PDFPreviewToolbar } from "./PDFPreviewToolbar";

type PDFJSModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: typeof getPDFDocument;
};
type PDFState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; error: AssetPreviewErrorCode };
type PDFPreviewController = {
  state: PDFState;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  page: number;
  pages: number;
  zoom: number;
  rendering: boolean;
  previousPage: () => void;
  nextPage: () => void;
  zoomOut: () => void;
  zoomIn: () => void;
};

let pdfJSModulePromise: Promise<PDFJSModule> | null = null;
const annotationModeDisabled = 0;
const pdfCMapURL = "/pdfjs/cmaps/";

function loadPDFJS() {
  if (!pdfJSModulePromise) {
    pdfJSModulePromise = import("pdfjs-dist/legacy/build/pdf.mjs")
      .then((pdfjs) => {
        const loadedModule: PDFJSModule = pdfjs;
        const workerOptions = loadedModule.GlobalWorkerOptions;
        workerOptions.workerSrc = new URL(
          "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        return loadedModule;
      })
      .catch((error: unknown) => {
        pdfJSModulePromise = null;
        throw error;
      });
  }
  return pdfJSModulePromise;
}

function ignoreRejection(promise: Promise<unknown> | undefined) {
  if (promise) void promise.catch(() => undefined);
}

function pdfErrorCode(error: unknown): AssetPreviewErrorCode | null {
  const name = error instanceof Error ? error.name : "";
  switch (name) {
    case "PasswordException":
      return "encrypted";
    case "MissingPDFException":
      return "not_found";
    case "UnexpectedResponseException":
      return "invalid_response";
    case "RenderingCancelledException":
      return null;
    case "InvalidPDFException":
    default:
      return "invalid_document";
  }
}

function clearCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const target = canvas;
  target.width = 0;
  target.height = 0;
  target.style.width = "";
  target.style.height = "";
}

function shouldIgnorePageShortcut(target: EventTarget | null) {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

function usePDFPreview(previewURL: string): PDFPreviewController {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loadingTaskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const pageRef = useRef<PDFPageProxy | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const loadGenerationRef = useRef(0);
  const renderGenerationRef = useRef(0);
  const [state, setState] = useState<PDFState>({ status: "loading" });
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rendering, setRendering] = useState(true);

  const cancelRender = useCallback(() => {
    renderGenerationRef.current += 1;
    renderTaskRef.current?.cancel();
    renderTaskRef.current = null;
    pageRef.current?.cleanup();
    pageRef.current = null;
    clearCanvas(canvasRef.current);
  }, []);

  const destroyDocument = useCallback(() => {
    cancelRender();
    const document = documentRef.current;
    const loadingTask = loadingTaskRef.current;
    documentRef.current = null;
    loadingTaskRef.current = null;
    if (document) ignoreRejection(document.destroy());
    else if (loadingTask) ignoreRejection(loadingTask.destroy());
  }, [cancelRender]);

  useEffect(() => {
    const generation = ++loadGenerationRef.current;
    let passwordDetected = false;

    void loadPDFJS().then((pdfjs) => {
      if (generation !== loadGenerationRef.current) return;
      const loadingTask = pdfjs.getDocument({
        url: previewURL,
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
        cMapUrl: pdfCMapURL,
        cMapPacked: true,
        verbosity: 0,
      });
      loadingTaskRef.current = loadingTask;
      loadingTask.onPassword = () => {
        if (generation !== loadGenerationRef.current) return;
        passwordDetected = true;
        loadingTaskRef.current = null;
        ignoreRejection(loadingTask.destroy());
        setState({ status: "error", error: "encrypted" });
      };
      return loadingTask.promise.then((document) => {
        if (generation !== loadGenerationRef.current || passwordDetected) {
          ignoreRejection(document.destroy());
          return;
        }
        if (document.numPages > PDF_PREVIEW_MAX_PAGES) {
          loadingTaskRef.current = null;
          ignoreRejection(document.destroy());
          setState({ status: "error", error: "resource_limit" });
          return;
        }
        documentRef.current = document;
        setPages(document.numPages);
        setState({ status: "ready" });
      });
    }).catch((error: unknown) => {
      if (generation !== loadGenerationRef.current || passwordDetected) return;
      const loadingTask = loadingTaskRef.current;
      loadingTaskRef.current = null;
      ignoreRejection(loadingTask?.destroy());
      const code = pdfErrorCode(error);
      if (code) setState({ status: "error", error: code });
    });

    return () => {
      loadGenerationRef.current += 1;
      destroyDocument();
    };
  }, [destroyDocument, previewURL]);

  useEffect(() => {
    if (state.status !== "ready" || !documentRef.current) return;
    const generation = ++renderGenerationRef.current;
    renderTaskRef.current?.cancel();
    renderTaskRef.current = null;
    pageRef.current?.cleanup();
    pageRef.current = null;
    clearCanvas(canvasRef.current);

    void documentRef.current.getPage(page).then((pdfPage) => {
      if (generation !== renderGenerationRef.current) {
        pdfPage.cleanup();
        return;
      }
      pageRef.current = pdfPage;
      const baseViewport = pdfPage.getViewport({ scale: 1 });
      if (
        !Number.isFinite(baseViewport.width)
        || !Number.isFinite(baseViewport.height)
        || baseViewport.width <= 0
        || baseViewport.height <= 0
      ) {
        throw new Error("InvalidPDFPageSize");
      }
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const areaScale = Math.sqrt(
        PDF_PREVIEW_MAX_RENDER_PIXELS / (baseViewport.width * baseViewport.height),
      );
      const displayScale = Math.min(
        zoom,
        areaScale,
        PDF_PREVIEW_MAX_RENDER_SIDE / baseViewport.width,
        PDF_PREVIEW_MAX_RENDER_SIDE / baseViewport.height,
      );
      const requestedScale = displayScale * pixelRatio;
      const renderScale = Math.min(
        requestedScale,
        areaScale,
        PDF_PREVIEW_MAX_RENDER_SIDE / baseViewport.width,
        PDF_PREVIEW_MAX_RENDER_SIDE / baseViewport.height,
      );
      const viewport = pdfPage.getViewport({ scale: renderScale });
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("MissingPDFCanvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      canvas.style.width = `${Math.max(1, Math.floor(baseViewport.width * displayScale))}px`;
      canvas.style.height = `${Math.max(1, Math.floor(baseViewport.height * displayScale))}px`;
      const renderTask = pdfPage.render({
        canvas,
        viewport,
        annotationMode: annotationModeDisabled,
        background: "#ffffff",
      });
      renderTaskRef.current = renderTask;
      return renderTask.promise;
    }).then(() => {
      if (generation !== renderGenerationRef.current) return;
      renderTaskRef.current = null;
      setRendering(false);
    }).catch((error: unknown) => {
      if (generation !== renderGenerationRef.current) return;
      const code = pdfErrorCode(error);
      if (!code) return;
      destroyDocument();
      setRendering(false);
      setState({ status: "error", error: code });
    });

    return () => {
      renderGenerationRef.current += 1;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      pageRef.current?.cleanup();
      pageRef.current = null;
    };
  }, [destroyDocument, page, state.status, zoom]);

  const beginRender = useCallback(() => setRendering(true), []);
  const previousPage = useCallback(() => {
    beginRender();
    setPage((current) => Math.max(1, current - 1));
  }, [beginRender]);
  const nextPage = useCallback(() => {
    beginRender();
    setPage((current) => Math.min(pages, current + 1));
  }, [beginRender, pages]);
  const zoomOut = useCallback(() => {
    beginRender();
    setZoom((current) => Math.max(
      PDF_PREVIEW_MIN_ZOOM,
      current - PDF_PREVIEW_ZOOM_STEP,
    ));
  }, [beginRender]);
  const zoomIn = useCallback(() => {
    beginRender();
    setZoom((current) => Math.min(
      PDF_PREVIEW_MAX_ZOOM,
      current + PDF_PREVIEW_ZOOM_STEP,
    ));
  }, [beginRender]);

  return {
    state,
    canvasRef,
    page,
    pages,
    zoom,
    rendering,
    previousPage,
    nextPage,
    zoomOut,
    zoomIn,
  };
}

export function PDFAssetPreview({
  asset,
  previewURL,
  downloadURL,
  onRetry,
}: {
  asset: Asset;
  previewURL: string;
  downloadURL: string | null;
  onRetry: () => void;
}) {
  return (
    <PDFAssetPreviewDocument
      key={previewURL}
      asset={asset}
      previewURL={previewURL}
      downloadURL={downloadURL}
      onRetry={onRetry}
    />
  );
}

function PDFAssetPreviewDocument({
  asset,
  previewURL,
  downloadURL,
  onRetry,
}: {
  asset: Asset;
  previewURL: string;
  downloadURL: string | null;
  onRetry: () => void;
}) {
  const {
    state,
    canvasRef,
    page,
    pages,
    zoom,
    rendering,
    previousPage,
    nextPage,
    zoomOut,
    zoomIn,
  } = usePDFPreview(previewURL);

  if (state.status === "loading") {
    return <AssetPreviewLoading kind="pdf" />;
  }
  if (state.status === "error") {
    return (
      <AssetPreviewFailure
        error={state.error}
        kind="pdf"
        downloadURL={downloadURL}
        filename={asset.name}
        onRetry={onRetry}
      />
    );
  }

  return (
    <section
      aria-label={`PDF preview: ${asset.name}`}
      tabIndex={0}
      onKeyDown={(event) => {
        if (shouldIgnorePageShortcut(event.target)) return;
        if (event.key === "PageUp" && page > 1) {
          event.preventDefault();
          previousPage();
        } else if (event.key === "PageDown" && page < pages) {
          event.preventDefault();
          nextPage();
        }
      }}
      className="h-[60dvh] min-h-80 max-h-[48rem] w-full overflow-hidden rounded-md border border-border bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <PDFPreviewToolbar
        page={page}
        pages={pages}
        zoom={zoom}
        onPrevious={previousPage}
        onNext={nextPage}
        onZoomOut={zoomOut}
        onZoomIn={zoomIn}
      />
      <div className="relative h-[calc(100%-3rem)] overflow-auto overscroll-contain p-3">
        {rendering ? (
          <div
            role="status"
            className="pointer-events-none absolute inset-x-0 top-3 z-10 mx-auto w-fit rounded-md bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm"
          >
            Rendering page…
          </div>
        ) : null}
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Page ${page} of ${pages}: ${asset.name}`}
          className="mx-auto block max-w-none bg-white shadow-sm"
        />
      </div>
    </section>
  );
}
