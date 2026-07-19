"use client";

import { useCallback, useEffect, useRef, useState, type UIEvent } from "react";

import { apiFetch } from "@/lib/api";
import type { TemplateMeta, TemplateMetaPage } from "@/types";
import { TEMPLATE_META_PAGE_LIMIT } from "../utils";

type Toast = (input: { description: string; variant?: "error" }) => void;

function isAbort(error: unknown, signal: AbortSignal) {
  return signal.aborted || (error instanceof DOMException && error.name === "AbortError");
}

export function useTemplateCatalog(toast: Toast) {
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [templatesTotal, setTemplatesTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [selectedID, setSelectedID] = useState("");
  const [search, setSearchState] = useState("");
  const [query, setQuery] = useState("");
  const initializedRef = useRef(false);
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const loadTemplates = useCallback(async (
    offset: number,
    reset: boolean,
    requestedQuery: string,
  ): Promise<TemplateMetaPage | null> => {
    const requestID = requestRef.current + 1;
    requestRef.current = requestID;
    if (reset) {
      abortRef.current?.abort();
      setLoading(true);
      setListError(null);
    } else {
      setLoadingMore(true);
      setLoadMoreError(null);
    }
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const params = new URLSearchParams({
        limit: String(TEMPLATE_META_PAGE_LIMIT),
        offset: String(offset),
      });
      params.set("q", requestedQuery);
      const page = await apiFetch<TemplateMetaPage>(
        `/templates/meta?${params.toString()}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted || requestRef.current !== requestID) return null;
      setTemplatesTotal(page.total);
      if (reset) {
        setTemplates(page.items);
        if (!initializedRef.current) {
          initializedRef.current = true;
          setSelectedID(page.items[0]?.id ?? "");
        }
      } else {
        setTemplates((previous) => {
          const existing = new Set(previous.map((item) => item.id));
          return [...previous, ...page.items.filter((item) => !existing.has(item.id))];
        });
      }
      return page;
    } catch (error) {
      if (isAbort(error, controller.signal)) return null;
      const message = error instanceof Error ? error.message : "Failed to load templates";
      if (reset) setListError(message);
      else setLoadMoreError(message);
      return null;
    } finally {
      if (requestRef.current === requestID) {
        if (reset) setLoading(false);
        else setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadTemplates(0, true, query);
    return () => abortRef.current?.abort();
  }, [loadTemplates, query]);

  useEffect(() => {
    const trimmed = search.trim();
    if (!trimmed) return;
    const timer = window.setTimeout(() => setQuery(trimmed), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const setSearch = useCallback((value: string) => {
    setSearchState(value);
    if (!value.trim()) setQuery("");
  }, []);

  const reload = useCallback(
    (requestedQuery = query) => loadTemplates(0, true, requestedQuery),
    [loadTemplates, query],
  );

  const handleTemplateListScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (loading || loadingMore || templates.length >= templatesTotal) return;
    const element = event.currentTarget;
    if (element.scrollTop + element.clientHeight >= element.scrollHeight - 48) {
      void loadTemplates(templates.length, false, query);
    }
  }, [loadTemplates, loading, loadingMore, query, templates.length, templatesTotal]);

  const retryLoadMore = useCallback(() => {
    void loadTemplates(templates.length, false, query);
  }, [loadTemplates, query, templates.length]);

  const showLoadError = useCallback((message: string) => {
    toast({ description: message, variant: "error" });
  }, [toast]);

  return {
    templates,
    templatesTotal,
    loading,
    loadingMore,
    listError,
    loadMoreError,
    selectedID,
    setSelectedID,
    search,
    setSearch,
    query,
    reload,
    handleTemplateListScroll,
    retryLoadMore,
    showLoadError,
  };
}
