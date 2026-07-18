"use client";

import { useMemo } from "react";
import { docEditorService } from "../services/doc-editor.service";

export function useDocumentActions(docId: string) {
  return useMemo(
    () => ({
      getDocument: () => docEditorService.getDocument(docId),
      // baseRevision is the optimistic-lock precondition. saveSeq is sent
      // alongside it only for rolling compatibility with older backends.
      saveDocument: (title: string, content: string, baseRevision: number, saveSeq: number) =>
        docEditorService.saveDocument(docId, { title, content, base_revision: baseRevision, save_seq: saveSeq }),
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
