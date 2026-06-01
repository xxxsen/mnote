"use client";

import { useMemo } from "react";
import { docEditorService } from "../services/doc-editor.service";

export function useDocumentActions(docId: string) {
  return useMemo(
    () => ({
      getDocument: () => docEditorService.getDocument(docId),
      // saveDocument forwards save_seq so the backend can ignore late
      // requests carrying a stale sequence number. The returned
      // SaveDocumentResult is consumed by the save queue to advance its
      // local sequence ref.
      saveDocument: (title: string, content: string, saveSeq: number) =>
        docEditorService.saveDocument(docId, { title, content, save_seq: saveSeq }),
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
