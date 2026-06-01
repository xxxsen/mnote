"use client";

import { useMemo } from "react";
import { docEditorService } from "../services/doc-editor.service";

export function useDocumentActions(docId: string) {
  return useMemo(
    () => ({
      getDocument: () => docEditorService.getDocument(docId),
      // saveDocument forwards base_revision so the backend can enforce the
      // optimistic concurrency check (BE-3). The returned SaveDocumentResult
      // is consumed by the save queue to advance its local revision ref.
      saveDocument: (title: string, content: string, baseRevision: number) =>
        docEditorService.saveDocument(docId, { title, content, base_revision: baseRevision }),
      deleteDocument: () => docEditorService.deleteDocument(docId),
      listVersions: () => docEditorService.listVersions(docId),
      createShare: () => docEditorService.createShare(docId),
      getShare: () => docEditorService.getShare(docId),
      updateShareConfig: (payload: { expires_at: number; password?: string; clear_password?: boolean; permission: "view" | "comment"; allow_download: boolean }) =>
        docEditorService.updateShareConfig(docId, payload),
      revokeShare: () => docEditorService.revokeShare(docId),
    }),
    [docId]
  );
}
