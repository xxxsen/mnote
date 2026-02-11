"use client";

import { useMemo } from "react";
import { docEditorService } from "../services/doc-editor.service";

export function useTagActions(docId: string) {
  return useMemo(
    () => ({
      searchTags: (query: string) => docEditorService.searchTags(query),
      saveTags: (tagIDs: string[]) => docEditorService.saveTags(docId, tagIDs),
    }),
    [docId]
  );
}
