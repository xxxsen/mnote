import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { SavedView, SavedViewDTO } from "../types";

type ToastVariant = "default" | "success" | "error";

interface UseSavedViewsDeps {
  toast: (opts: { description: string; variant?: ToastVariant }) => void;
}

export function useSavedViews({ toast }: UseSavedViewsDeps) {
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);

  const fetchSavedViews = useCallback(async () => {
    try {
      const res = await apiFetch<SavedViewDTO[]>("/saved-views");
      setSavedViews(res.map((item) => ({
        id: item.id,
        name: item.name,
        search: item.search || "",
        selectedTag: item.tag_id || "",
        showStarred: item.show_starred === 1,
        showShared: item.show_shared === 1,
      })));
    } catch (e) {
      console.error(e);
      setSavedViews([]);
    }
  }, []);

  const handleSaveCurrentView = useCallback(async (filters: {
    search: string; selectedTag: string; showStarred: boolean; showShared: boolean;
  }) => {
    const hasFilter = Boolean(filters.search.trim() || filters.selectedTag || filters.showStarred || filters.showShared);
    if (!hasFilter) {
      toast({ description: "Apply a filter before saving a view." });
      return;
    }
    const defaultName = `View ${savedViews.length + 1}`;
    const name = window.prompt("Saved view name", defaultName)?.trim();
    if (!name) return;
    try {
      await apiFetch<SavedViewDTO>("/saved-views", {
        method: "POST",
        body: JSON.stringify({
          name,
          search: filters.search,
          tag_id: filters.selectedTag,
          show_starred: filters.showStarred,
          show_shared: filters.showShared,
        }),
      });
      await fetchSavedViews();
      toast({ description: "Saved view created." });
    } catch (e) {
      console.error(e);
      toast({ description: "Failed to save view", variant: "error" });
    }
  }, [fetchSavedViews, savedViews.length, toast]);

  const removeSavedView = useCallback(async (viewID: string) => {
    try {
      await apiFetch(`/saved-views/${viewID}`, { method: "DELETE" });
      await fetchSavedViews();
    } catch (e) {
      console.error(e);
      toast({ description: "Failed to delete saved view", variant: "error" });
    }
  }, [fetchSavedViews, toast]);

  return { savedViews, fetchSavedViews, handleSaveCurrentView, removeSavedView };
}
