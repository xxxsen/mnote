"use client";

import { useCallback, useEffect, useState } from "react";

import {
  EDITOR_VIEW_MODE_STORAGE_KEY,
  loadEditorViewModePreference,
  saveEditorViewModePreference,
  type EditorViewMode,
} from "@/lib/editor-view-mode";

const RATIO_KEY = "mnote:editor-split-ratio:v1";
const SCROLL_SYNC_KEY = "mnote:editor-scroll-sync:v1";

export type { EditorViewMode } from "@/lib/editor-view-mode";

function readRatio(): number {
  if (typeof window === "undefined") return 50;
  const value = Number(window.localStorage.getItem(RATIO_KEY));
  return Number.isFinite(value) && value >= 30 && value <= 70 ? value : 50;
}

function readScrollSync(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(SCROLL_SYNC_KEY) !== "false";
}

export function clampSplitRatio(value: number): number {
  return Math.max(30, Math.min(70, Math.round(value)));
}

export function useEditorViewMode() {
  const [viewMode, setViewModeState] = useState<EditorViewMode>(
    loadEditorViewModePreference,
  );
  const [splitRatio, setSplitRatioState] = useState(readRatio);
  const [scrollSyncEnabled, setScrollSyncEnabledState] = useState(readScrollSync);

  const setViewMode = useCallback((mode: EditorViewMode) => {
    setViewModeState(mode);
    saveEditorViewModePreference(mode);
  }, []);
  const setSplitRatio = useCallback((ratio: number) => {
    const next = clampSplitRatio(ratio);
    setSplitRatioState(next);
    window.localStorage.setItem(RATIO_KEY, String(next));
  }, []);
  const setScrollSyncEnabled = useCallback((enabled: boolean) => {
    setScrollSyncEnabledState(enabled);
    window.localStorage.setItem(SCROLL_SYNC_KEY, String(enabled));
  }, []);

  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key === EDITOR_VIEW_MODE_STORAGE_KEY) {
        setViewModeState(loadEditorViewModePreference());
      }
      if (event.key === RATIO_KEY) setSplitRatioState(readRatio());
      if (event.key === SCROLL_SYNC_KEY) setScrollSyncEnabledState(readScrollSync());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return {
    viewMode,
    setViewMode,
    splitRatio,
    setSplitRatio,
    scrollSyncEnabled,
    setScrollSyncEnabled,
  };
}
