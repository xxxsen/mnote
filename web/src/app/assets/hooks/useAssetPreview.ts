"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Asset } from "@/types";

import {
  classifyAssetPreview,
  normalizeAssetContentType,
  PDF_PREVIEW_MAX_BYTES,
  resolveAssetPreviewURL,
  type AssetPreviewKind,
} from "../helpers";

export type AssetPreviewErrorCode =
  | "not_found"
  | "unsupported"
  | "too_large"
  | "encrypted"
  | "invalid_document"
  | "resource_limit"
  | "network"
  | "invalid_response";

export class AssetPreviewError extends Error {
  constructor(public readonly code: AssetPreviewErrorCode) {
    super(code);
    this.name = "AssetPreviewError";
  }
}

export type AssetPreviewState =
  | { status: "unsupported" }
  | { status: "checking" }
  | { status: "ready" }
  | { status: "error"; error: AssetPreviewErrorCode };

export type AssetPreviewProbe = {
  contentType: string;
  size: number;
};

type PreviewResult = {
  requestKey: string;
  state: AssetPreviewState;
  size: number | null;
};

function isAbortError(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "name" in error
    && error.name === "AbortError";
}

function responseError(status: number): AssetPreviewErrorCode | null {
  switch (status) {
    case 404:
      return "not_found";
    case 413:
      return "too_large";
    case 415:
      return "unsupported";
    default:
      return status >= 200 && status < 300 ? null : "invalid_response";
  }
}

function validatePreviewContentType(
  value: string,
  expectedKind: Exclude<AssetPreviewKind, "image" | "unsupported">,
) {
  const contentType = normalizeAssetContentType(value);
  const matches = expectedKind === "pdf"
    ? contentType === "application/pdf"
    : contentType.startsWith(`${expectedKind}/`);
  if (!matches) throw new AssetPreviewError("invalid_response");
  return contentType;
}

function parsePreviewSize(value: string) {
  if (!/^\d+$/.test(value)) throw new AssetPreviewError("invalid_response");
  const size = Number(value);
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new AssetPreviewError("invalid_response");
  }
  return size;
}

export async function probeAssetPreview(
  url: string,
  expectedKind: Exclude<AssetPreviewKind, "image" | "unsupported">,
  signal: AbortSignal,
): Promise<AssetPreviewProbe> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "HEAD",
      signal,
      credentials: "omit",
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new AssetPreviewError("network");
  }

  const errorCode = responseError(response.status);
  if (errorCode) throw new AssetPreviewError(errorCode);
  const contentType = validatePreviewContentType(
    response.headers.get("Content-Type") || "",
    expectedKind,
  );
  const size = parsePreviewSize(response.headers.get("Content-Length") || "");
  if (expectedKind === "pdf" && size > PDF_PREVIEW_MAX_BYTES) {
    throw new AssetPreviewError("too_large");
  }
  return { contentType, size };
}

function initialState(
  assetID: string,
  kind: AssetPreviewKind,
  previewURL: string | null,
): AssetPreviewState {
  if (!assetID || !previewURL || kind === "unsupported") {
    return { status: "unsupported" };
  }
  return kind === "image"
    ? { status: "ready" }
    : { status: "checking" };
}

export function useAssetPreview(asset: Asset | null) {
  const kind = asset
    ? classifyAssetPreview(asset.content_type, asset.name)
    : "unsupported";
  const assetID = asset?.id || "";
  const previewURL = asset ? resolveAssetPreviewURL(asset.file_key) : null;
  const [retryGeneration, setRetryGeneration] = useState(0);
  const requestKey = JSON.stringify([
    assetID,
    asset?.file_key || "",
    asset?.content_type || "",
    asset?.name || "",
    retryGeneration,
  ]);
  const [result, setResult] = useState<PreviewResult>(() => ({
    requestKey,
    state: initialState(assetID, kind, previewURL),
    size: null,
  }));
  const requestIDRef = useRef(0);
  const currentResult = result.requestKey === requestKey
    ? result
    : {
        requestKey,
        state: initialState(assetID, kind, previewURL),
        size: null,
      };

  useEffect(() => {
    const requestID = ++requestIDRef.current;
    if (
      !assetID
      || !previewURL
      || kind === "unsupported"
      || kind === "image"
    ) {
      return;
    }

    const controller = new AbortController();
    void probeAssetPreview(previewURL, kind, controller.signal).then(
      (probe) => {
        if (requestIDRef.current !== requestID) return;
        setResult({
          requestKey,
          state: { status: "ready" },
          size: probe.size,
        });
      },
      (error: unknown) => {
        if (requestIDRef.current !== requestID || isAbortError(error)) return;
        setResult({
          requestKey,
          state: {
            status: "error",
            error: error instanceof AssetPreviewError
              ? error.code
              : "invalid_response",
          },
          size: null,
        });
      },
    );
    return () => controller.abort();
  }, [assetID, kind, previewURL, requestKey]);

  const retry = useCallback(() => {
    setRetryGeneration((generation) => generation + 1);
  }, []);

  return {
    kind,
    previewURL,
    size: currentResult.size,
    state: currentResult.state,
    retry,
  };
}
