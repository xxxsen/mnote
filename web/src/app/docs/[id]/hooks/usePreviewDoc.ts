"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Document } from "@/types";

type UsePreviewDocOptions = {
  onError?: (err: unknown) => void;
};

function isCurrentPreviewRequest(
  activeRequest: { id: number } | null,
  requestID: number,
): boolean {
  return activeRequest !== null && activeRequest.id === requestID;
}

export function usePreviewDoc({ onError }: UsePreviewDocOptions = {}) {
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const activeRequestRef = useRef<{
    id: number;
    controller: AbortController;
  } | null>(null);
  const requestIDRef = useRef(0);

  const updatePreviewDoc = useCallback((document: Document | null) => {
    if (document === null) {
      activeRequestRef.current?.controller.abort();
      activeRequestRef.current = null;
      setPreviewLoading(false);
    }
    setPreviewDoc(document);
  }, []);

  const handleOpenPreview = useCallback(
    async (docID: string) => {
      const previousRequest = activeRequestRef.current;
      if (previousRequest) previousRequest.controller.abort();
      const controller = new AbortController();
      const requestID = ++requestIDRef.current;
      activeRequestRef.current = { id: requestID, controller };
      setPreviewLoading(true);
      try {
        const res = await apiFetch<{ document: Document }>(
          `/documents/${encodeURIComponent(docID)}`,
          { signal: controller.signal },
        );
        if (
          controller.signal.aborted ||
          !isCurrentPreviewRequest(activeRequestRef.current, requestID)
        ) {
          return;
        }
        setPreviewDoc(res.document);
      } catch (err) {
        if (
          !controller.signal.aborted &&
          isCurrentPreviewRequest(activeRequestRef.current, requestID)
        ) {
          onError?.(err);
        }
      } finally {
        if (isCurrentPreviewRequest(activeRequestRef.current, requestID)) {
          activeRequestRef.current = null;
          setPreviewLoading(false);
        }
      }
    },
    [onError],
  );

  useEffect(
    () => () => {
      activeRequestRef.current?.controller.abort();
    },
    [],
  );

  return {
    previewDoc,
    setPreviewDoc: updatePreviewDoc,
    previewLoading,
    handleOpenPreview,
  };
}
