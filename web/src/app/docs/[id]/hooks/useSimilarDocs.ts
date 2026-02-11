"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { SimilarDoc } from "../types";

type UseSimilarDocsOptions = {
  docId: string;
  title: string;
};

export function useSimilarDocs({ docId, title }: UseSimilarDocsOptions) {
  const [similarDocs, setSimilarDocs] = useState<SimilarDoc[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarCollapsed, setSimilarCollapsed] = useState(true);
  const [similarIconVisible, setSimilarIconVisible] = useState(false);

  const similarTimerRef = useRef<number | null>(null);
  const skipSimilarFetchRef = useRef(false);

  const fetchSimilar = useCallback(
    async (query: string) => {
      if (!query || query.length < 2) {
        setSimilarDocs([]);
        return;
      }
      setSimilarLoading(true);
      try {
        const res = await apiFetch<{ items: SimilarDoc[] }>(`/ai/search?q=${encodeURIComponent(query)}&limit=5&exclude_id=${docId}`);
        setSimilarDocs(res?.items || []);
      } catch {
        setSimilarDocs([]);
      } finally {
        setSimilarLoading(false);
      }
    },
    [docId]
  );

  useEffect(() => {
    if (similarTimerRef.current) {
      window.clearTimeout(similarTimerRef.current);
    }
    if (!title || title.length < 2) {
      setSimilarIconVisible(false);
      return;
    }
    setSimilarIconVisible(true);

    if (!similarCollapsed) {
      if (skipSimilarFetchRef.current) {
        skipSimilarFetchRef.current = false;
        return;
      }
      similarTimerRef.current = window.setTimeout(() => {
        void fetchSimilar(title);
      }, 1000);
    }

    return () => {
      if (similarTimerRef.current) {
        window.clearTimeout(similarTimerRef.current);
      }
    };
  }, [title, fetchSimilar, similarCollapsed]);

  const handleToggleSimilar = useCallback(() => {
    if (similarCollapsed) {
      setSimilarCollapsed(false);
      skipSimilarFetchRef.current = true;
      void fetchSimilar(title);
      return;
    }
    setSimilarCollapsed(true);
  }, [similarCollapsed, fetchSimilar, title]);

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
    similarCollapsed,
    similarIconVisible,
    handleToggleSimilar,
    handleCollapseSimilar,
    handleCloseSimilar,
  };
}
