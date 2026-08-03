export type EditorViewMode = "edit" | "split" | "preview";

export const EDITOR_VIEW_MODE_STORAGE_KEY = "mnote:editor-view-mode:v1";
export const NEW_NOTE_EDITOR_VIEW_MODE: EditorViewMode = "split";

const DEFAULT_EDITOR_VIEW_MODE: EditorViewMode = "split";

export function loadEditorViewModePreference(): EditorViewMode {
  if (typeof window === "undefined") return DEFAULT_EDITOR_VIEW_MODE;
  const value = window.localStorage.getItem(EDITOR_VIEW_MODE_STORAGE_KEY);
  return value === "edit" || value === "split" || value === "preview"
    ? value
    : DEFAULT_EDITOR_VIEW_MODE;
}

export function saveEditorViewModePreference(mode: EditorViewMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EDITOR_VIEW_MODE_STORAGE_KEY, mode);
}
