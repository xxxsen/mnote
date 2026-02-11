"use client";

import { useMemo } from "react";
import { docEditorService } from "../services/doc-editor.service";

export function useDocumentActions(docId: string) {
  return useMemo(
    () => ({
      getDocument: () => docEditorService.getDocument(docId),
      saveDocument: (title: string, content: string) => docEditorService.saveDocument(docId, { title, content }),
      deleteDocument: () => docEditorService.deleteDocument(docId),
      listVersions: () => docEditorService.listVersions(docId),
      createShare: () => docEditorService.createShare(docId),
      getShare: () => docEditorService.getShare(docId),
      revokeShare: () => docEditorService.revokeShare(docId),
    }),
    [docId]
  );
}
