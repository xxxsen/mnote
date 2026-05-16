"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Document } from "@/types";

type UseQuickOpenOptions = {
  onSelectDocument: (doc: Document) => void;
};

const isAbortError = (e: unknown): boolean =>
  e instanceof DOMException && e.name === "AbortError";

export function useQuickOpen({ onSelectDocument }: UseQuickOpenOptions) {
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = useState("");
  const [quickOpenResults, setQuickOpenResults] = useState<Document[]>([]);
  const [quickOpenRecent, setQuickOpenRecent] = useState<Document[]>([]);
  const [quickOpenIndex, setQuickOpenIndex] = useState(0);
  const [quickOpenLoading, setQuickOpenLoading] = useState(false);
  const recentAbortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  const fetchRecentDocs = useCallback(async () => {
    recentAbortRef.current?.abort();
    const controller = new AbortController();
    recentAbortRef.current = controller;
    try {
      const docs = await apiFetch<Document[]>("/documents?limit=5&order=mtime", { signal: controller.signal });
      if (!controller.signal.aborted) setQuickOpenRecent(docs);
    } catch (e) {
      if (isAbortError(e)) return;
      setQuickOpenRecent([]);
    } finally {
      if (recentAbortRef.current === controller) recentAbortRef.current = null;
    }
  }, []);

  const fetchQuickOpenSearch = useCallback(async (query: string) => {
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setQuickOpenLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("q", query);
      params.set("limit", "5");
      const docs = await apiFetch<Document[]>(`/documents?${params.toString()}`, { signal: controller.signal });
      if (!controller.signal.aborted) setQuickOpenResults(docs);
    } catch (e) {
      if (isAbortError(e)) return;
      setQuickOpenResults([]);
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null;
        setQuickOpenLoading(false);
      }
    }
  }, []);

  const handleOpenQuickOpen = useCallback(() => {
    setQuickOpenQuery("");
    setQuickOpenIndex(0);
    setShowQuickOpen(true);
  }, []);

  const handleCloseQuickOpen = useCallback(() => {
    setShowQuickOpen(false);
    setQuickOpenQuery("");
    setQuickOpenIndex(0);
  }, []);

  const handleQuickOpenSelect = useCallback(
    (doc: Document) => {
      onSelectDocument(doc);
      handleCloseQuickOpen();
    },
    [handleCloseQuickOpen, onSelectDocument]
  );

  const showSearchResults = quickOpenQuery.trim().length > 0;
  const quickOpenDocs = useMemo(
    () => (showSearchResults ? quickOpenResults : quickOpenRecent),
    [showSearchResults, quickOpenRecent, quickOpenResults]
  );

  useEffect(() => {
    if (!showQuickOpen) {
      recentAbortRef.current?.abort();
      searchAbortRef.current?.abort();
      return;
    }
    if (!quickOpenQuery.trim()) {
      setQuickOpenResults([]);
      setQuickOpenIndex(0);
      void fetchRecentDocs();
      return;
    }
    const timer = window.setTimeout(() => {
      setQuickOpenIndex(0);
      void fetchQuickOpenSearch(quickOpenQuery.trim());
    }, 200);
    return () => window.clearTimeout(timer);
  }, [fetchQuickOpenSearch, fetchRecentDocs, quickOpenQuery, showQuickOpen]);

  useEffect(() => {
    if (!showQuickOpen) return;
    if (quickOpenIndex >= quickOpenDocs.length) {
      setQuickOpenIndex(0);
    }
  }, [quickOpenDocs.length, quickOpenIndex, showQuickOpen]);

  useEffect(() => {
    const handleQuickOpen = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        handleOpenQuickOpen();
      }
    };
    window.addEventListener("keydown", handleQuickOpen);
    return () => window.removeEventListener("keydown", handleQuickOpen);
  }, [handleOpenQuickOpen]);

  return {
    showQuickOpen,
    quickOpenQuery,
    quickOpenResults,
    quickOpenRecent,
    quickOpenIndex,
    quickOpenLoading,
    showSearchResults,
    quickOpenDocs,
    setQuickOpenQuery,
    setQuickOpenIndex,
    handleOpenQuickOpen,
    handleCloseQuickOpen,
    handleQuickOpenSelect,
  };
}
