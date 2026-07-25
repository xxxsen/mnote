"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { SimilarDoc } from "../types";

const isAbortError = (e: unknown): boolean =>
  e instanceof DOMException && e.name === "AbortError";

type UseSimilarDocsOptions = {
  docId: string;
  title: string;
};

export type SimilarIndexStatus = "ready" | "pending" | "building" | "disabled" | "unavailable";

export function useSimilarDocs({ docId }: UseSimilarDocsOptions) {
  const [similarDocs, setSimilarDocs] = useState<SimilarDoc[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarCollapsed, setSimilarCollapsed] = useState(true);
  const [similarIconVisible, setSimilarIconVisible] = useState(Boolean(docId));
  const [similarIndexStatus, setSimilarIndexStatus] = useState<SimilarIndexStatus>("pending");

  const fetchAbortRef = useRef<AbortController | null>(null);

  const fetchSimilar = useCallback(
    async () => {
      if (!docId) {
        setSimilarDocs([]);
        setSimilarIndexStatus("unavailable");
        return;
      }
      if (fetchAbortRef.current) fetchAbortRef.current.abort();
      const controller = new AbortController();
      fetchAbortRef.current = controller;
      setSimilarLoading(true);
      try {
        const res = await apiFetch<{ items: SimilarDoc[]; index_status?: SimilarIndexStatus }>(
          `/documents/${encodeURIComponent(docId)}/similar?limit=5`,
          { signal: controller.signal },
        );
        /* v8 ignore next -- defensive abort guard: race between await resolve and controller.abort() */
        if (controller.signal.aborted) return;
        setSimilarDocs(res.items);
        setSimilarIndexStatus(res.index_status || "ready");
      } catch (err) {
        if (isAbortError(err)) return;
        setSimilarDocs([]);
        setSimilarIndexStatus("unavailable");
      } finally {
        if (fetchAbortRef.current === controller) {
          fetchAbortRef.current = null;
          setSimilarLoading(false);
        }
      }
    },
    [docId]
  );

  useEffect(() => {
    fetchAbortRef.current?.abort();
    fetchAbortRef.current = null;
    setSimilarDocs([]);
    setSimilarLoading(false);
    setSimilarCollapsed(true);
    setSimilarIndexStatus("pending");
    setSimilarIconVisible(Boolean(docId));
  }, [docId]);

  useEffect(() => {
    return () => {
      /* v8 ignore next -- unmount cleanup: ref may be null if no fetch was initiated */
      if (fetchAbortRef.current) fetchAbortRef.current.abort();
    };
  }, []);

  const handleToggleSimilar = useCallback(() => {
    if (similarCollapsed) {
      setSimilarCollapsed(false);
      void fetchSimilar();
      return;
    }
    setSimilarCollapsed(true);
  }, [similarCollapsed, fetchSimilar]);

  const handleCollapseSimilar = useCallback(() => {
    setSimilarCollapsed(true);
  }, []);

  const handleCloseSimilar = useCallback(() => {
    setSimilarCollapsed(true);
    setSimilarDocs([]);
    setSimilarIconVisible(false);
  }, []);

  return {
    similarDocs,
    similarLoading,
    similarIndexStatus,
    similarCollapsed,
    similarIconVisible,
    handleToggleSimilar,
    handleCollapseSimilar,
    handleCloseSimilar,
  };
}
