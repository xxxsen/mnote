"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ToastInput } from "@/components/ui/toast";
import { copyToClipboard } from "@/lib/clipboard";
import { apiFetch } from "@/lib/api";
import type { Asset } from "@/types";

import { assetMarkdown, resolveAssetURL } from "../helpers";

export type AssetReference = {
  document_id: string;
  title: string;
  mtime: number;
};

type Toast = (input: ToastInput) => void;

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function useAssetCatalog() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialError, setInitialError] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [selectedID, setSelectedID] = useState("");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestIDRef = useRef(0);
  const fetchingRef = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (nextOffset: number, append: boolean) => {
    if (fetchingRef.current && append) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    const requestID = ++requestIDRef.current;
    abortRef.current = controller;
    fetchingRef.current = true;
    if (append) {
      setLoadingMore(true);
      setLoadMoreError(false);
    } else {
      setLoading(true);
      setInitialError(false);
    }

    try {
      const params = new URLSearchParams({
        limit: "40",
        offset: String(nextOffset),
      });
      if (debouncedSearch) params.set("q", debouncedSearch);
      const result = await apiFetch<Asset[]>(`/assets?${params.toString()}`, {
        signal: controller.signal,
      });
      if (requestIDRef.current !== requestID) return;
      setAssets((previous) => {
        if (!append) return result;
        const existing = new Set(previous.map((asset) => asset.id));
        return [...previous, ...result.filter((asset) => !existing.has(asset.id))];
      });
      if (!append) {
        setSelectedID((previous) => (
          result.some((asset) => asset.id === previous) ? previous : result[0]?.id ?? ""
        ));
        setMobileDetailOpen(false);
      }
      setHasMore(result.length === 40);
      setOffset(nextOffset + result.length);
    } catch (error) {
      if (isAbortError(error) || requestIDRef.current !== requestID) return;
      if (append) setLoadMoreError(true);
      else setInitialError(true);
    } finally {
      if (requestIDRef.current === requestID) {
        abortRef.current = null;
        fetchingRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [debouncedSearch]);

  useEffect(() => {
    void load(0, false);
    return () => abortRef.current?.abort();
  }, [load]);

  const selected = useMemo(
    () => assets.find((asset) => asset.id === selectedID) ?? null,
    [assets, selectedID],
  );
  const selectAsset = useCallback((id: string) => {
    setSelectedID(id);
    setMobileDetailOpen(true);
  }, []);
  const clearSearch = useCallback(() => setSearch(""), []);
  const loadMore = useCallback(() => void load(offset, true), [load, offset]);
  const retryInitial = useCallback(() => void load(0, false), [load]);

  return {
    search,
    setSearch,
    debouncedSearch,
    clearSearch,
    assets,
    selected,
    selectedID,
    selectAsset,
    mobileDetailOpen,
    closeMobileDetail: () => setMobileDetailOpen(false),
    loading,
    loadingMore,
    initialError,
    loadMoreError,
    hasMore,
    loadMore,
    retryInitial,
  };
}

function useAssetReferences(selectedID: string) {
  const [references, setReferences] = useState<AssetReference[]>([]);
  const [loadingReferences, setLoadingReferences] = useState(false);
  const [referencesError, setReferencesError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const requestIDRef = useRef(0);

  const loadReferences = useCallback(async () => {
    abortRef.current?.abort();
    if (!selectedID) {
      setReferences([]);
      setReferencesError(false);
      return;
    }
    const controller = new AbortController();
    const requestID = ++requestIDRef.current;
    abortRef.current = controller;
    setLoadingReferences(true);
    setReferencesError(false);
    try {
      const result = await apiFetch<AssetReference[]>(
        `/assets/${selectedID}/references`,
        { signal: controller.signal },
      );
      if (requestIDRef.current === requestID) setReferences(result);
    } catch (error) {
      if (isAbortError(error) || requestIDRef.current !== requestID) return;
      setReferencesError(true);
    } finally {
      if (requestIDRef.current === requestID) {
        abortRef.current = null;
        setLoadingReferences(false);
      }
    }
  }, [selectedID]);

  useEffect(() => {
    void loadReferences();
    return () => abortRef.current?.abort();
  }, [loadReferences]);

  return {
    references,
    loadingReferences,
    referencesError,
    retryReferences: loadReferences,
  };
}

export function useAssets(toast: Toast) {
  const catalog = useAssetCatalog();
  const references = useAssetReferences(catalog.selectedID);

  const copy = useCallback(async (value: string, successMessage: string) => {
    const copied = await copyToClipboard(value);
    toast({
      description: copied ? successMessage : "Clipboard access failed. Copy the value manually.",
      variant: copied ? "success" : "error",
    });
  }, [toast]);
  const copyURL = useCallback(async () => {
    if (catalog.selected) {
      await copy(resolveAssetURL(catalog.selected.url), "Asset URL copied.");
    }
  }, [catalog.selected, copy]);
  const copyMarkdown = useCallback(async () => {
    if (catalog.selected) {
      const url = resolveAssetURL(catalog.selected.url);
      await copy(assetMarkdown(catalog.selected.name, url), "Markdown copied.");
    }
  }, [catalog.selected, copy]);

  return { ...catalog, ...references, copyURL, copyMarkdown };
}
