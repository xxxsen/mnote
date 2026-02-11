"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Document } from "@/types";

type UseQuickOpenOptions = {
  onSelectDocument: (doc: Document) => void;
};

export function useQuickOpen({ onSelectDocument }: UseQuickOpenOptions) {
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = useState("");
  const [quickOpenResults, setQuickOpenResults] = useState<Document[]>([]);
  const [quickOpenRecent, setQuickOpenRecent] = useState<Document[]>([]);
  const [quickOpenIndex, setQuickOpenIndex] = useState(0);
  const [quickOpenLoading, setQuickOpenLoading] = useState(false);

  const fetchRecentDocs = useCallback(async () => {
    try {
      const docs = await apiFetch<Document[]>("/documents?limit=5&order=mtime");
      setQuickOpenRecent(docs || []);
    } catch {
      setQuickOpenRecent([]);
    }
  }, []);

  const fetchQuickOpenSearch = useCallback(async (query: string) => {
    setQuickOpenLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("q", query);
      params.set("limit", "5");
      const docs = await apiFetch<Document[]>(`/documents?${params.toString()}`);
      setQuickOpenResults(docs || []);
    } catch {
      setQuickOpenResults([]);
    } finally {
      setQuickOpenLoading(false);
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
    if (!showQuickOpen) return;
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
