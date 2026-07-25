"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { EDITOR_CONTEXT_RAIL_COLLAPSED_KEY } from "../constants";

export const CONTEXT_RAIL_DOCK_MIN_WIDTH = 1280;

export type EditorContextView = "outline" | "details";
export type EditorDetailsTab = "history" | "share";

type RailState = {
  scopeKey: string;
  view: EditorContextView;
  detailsTab: EditorDetailsTab;
  drawerOpen: boolean;
};

function createDefaultState(scopeKey: string): RailState {
  return {
    scopeKey,
    view: "outline",
    detailsTab: "history",
    drawerOpen: false,
  };
}

function readCollapsedPreference(): boolean {
  /* v8 ignore next -- server render */
  if (typeof window === "undefined") return false;
  const raw = window.localStorage.getItem(EDITOR_CONTEXT_RAIL_COLLAPSED_KEY);
  return raw === "1" || raw === "true";
}

function subscribeDockViewport(onChange: () => void): () => void {
  const media = window.matchMedia(
    `(min-width: ${CONTEXT_RAIL_DOCK_MIN_WIDTH}px)`,
  );
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getDockViewportSnapshot(): boolean {
  return window.matchMedia(`(min-width: ${CONTEXT_RAIL_DOCK_MIN_WIDTH}px)`)
    .matches;
}

function getDockViewportServerSnapshot(): boolean {
  return false;
}

export function useEditorContextRail(docId: string) {
  const isDocked = useSyncExternalStore(
    subscribeDockViewport,
    getDockViewportSnapshot,
    getDockViewportServerSnapshot,
  );
  const [state, setState] = useState<RailState>(() =>
    createDefaultState(docId),
  );
  const [collapsed, setCollapsedState] = useState(readCollapsedPreference);
  const current = state.scopeKey === docId ? state : createDefaultState(docId);

  const update = useCallback(
    (patch: Partial<Omit<RailState, "scopeKey">>) => {
      setState((previous) => ({
        ...(previous.scopeKey === docId ? previous : createDefaultState(docId)),
        ...patch,
        scopeKey: docId,
      }));
    },
    [docId],
  );

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    window.localStorage.setItem(
      EDITOR_CONTEXT_RAIL_COLLAPSED_KEY,
      next ? "1" : "0",
    );
  }, []);

  const openOutline = useCallback(() => {
    update({ view: "outline", drawerOpen: !isDocked });
    if (isDocked) setCollapsed(false);
  }, [isDocked, setCollapsed, update]);

  const openDetails = useCallback(
    (tab?: EditorDetailsTab) => {
      update({
        view: "details",
        ...(tab ? { detailsTab: tab } : {}),
        drawerOpen: !isDocked,
      });
      if (isDocked) setCollapsed(false);
    },
    [isDocked, setCollapsed, update],
  );

  const closeDrawer = useCallback(() => {
    update({ drawerOpen: false });
  }, [update]);

  const toggleDetails = useCallback(() => {
    const detailsVisible =
      current.view === "details" &&
      (isDocked ? !collapsed : current.drawerOpen);
    if (detailsVisible) {
      openOutline();
      return;
    }
    openDetails("history");
  }, [
    collapsed,
    current.drawerOpen,
    current.view,
    isDocked,
    openDetails,
    openOutline,
  ]);

  useEffect(() => {
    const media = window.matchMedia(
      `(min-width: ${CONTEXT_RAIL_DOCK_MIN_WIDTH}px)`,
    );
    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) update({ drawerOpen: false });
    };
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, [update]);

  const outlineOpen =
    current.view === "outline" &&
    (isDocked ? !collapsed : current.drawerOpen);
  const detailsOpen =
    current.view === "details" &&
    (isDocked ? !collapsed : current.drawerOpen);

  return {
    scopeKey: docId,
    isDocked,
    view: current.view,
    detailsTab: current.detailsTab,
    collapsed,
    drawerOpen: !isDocked && current.drawerOpen,
    outlineOpen,
    detailsOpen,
    setDetailsTab: (detailsTab: EditorDetailsTab) =>
      update({ detailsTab, view: "details" }),
    setCollapsed,
    toggleCollapsed: () => setCollapsed(!collapsed),
    openOutline,
    openDetails,
    closeDrawer,
    toggleDetails,
  };
}

export type EditorContextRailController = ReturnType<
  typeof useEditorContextRail
>;
