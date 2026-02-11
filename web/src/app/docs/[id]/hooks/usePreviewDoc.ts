"use client";

import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Document } from "@/types";

type UsePreviewDocOptions = {
  onError?: (err: unknown) => void;
};

export function usePreviewDoc({ onError }: UsePreviewDocOptions = {}) {
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const handleOpenPreview = useCallback(
    async (docID: string) => {
      setPreviewLoading(true);
      try {
        const res = await apiFetch<{ document: Document }>(`/documents/${docID}`);
        setPreviewDoc(res?.document || null);
      } catch (err) {
        onError?.(err);
      } finally {
        setPreviewLoading(false);
      }
    },
    [onError]
  );

  return {
    previewDoc,
    setPreviewDoc,
    previewLoading,
    handleOpenPreview,
  };
}
