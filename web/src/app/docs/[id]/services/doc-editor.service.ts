import { apiFetch } from "@/lib/api";
import type { DocumentVersionSummary, Share, Tag } from "@/types";
import type { DocDetail, SaveDocumentPayload } from "../types";

export const docEditorService = {
  getDocument(docId: string): Promise<DocDetail> {
    return apiFetch<DocDetail>(`/documents/${docId}?include=tags`);
  },

  saveDocument(docId: string, payload: SaveDocumentPayload): Promise<void> {
    return apiFetch(`/documents/${docId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  deleteDocument(docId: string): Promise<void> {
    return apiFetch(`/documents/${docId}`, { method: "DELETE" });
  },

  listVersions(docId: string): Promise<DocumentVersionSummary[]> {
    return apiFetch<DocumentVersionSummary[]>(`/documents/${docId}/versions`);
  },

  createShare(docId: string): Promise<Share> {
    return apiFetch<Share>(`/documents/${docId}/share`, { method: "POST" });
  },

  getShare(docId: string): Promise<{ share: Share | null }> {
    return apiFetch<{ share: Share | null }>(`/documents/${docId}/share`);
  },

  updateShareConfig(
    docId: string,
    payload: { expires_at: number; password?: string; clear_password?: boolean; permission: "view" | "comment"; allow_download: boolean }
  ): Promise<Share> {
    return apiFetch<Share>(`/documents/${docId}/share`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  revokeShare(docId: string): Promise<void> {
    return apiFetch(`/documents/${docId}/share`, { method: "DELETE" });
  },

  searchTags(query: string): Promise<Tag[]> {
    const params = new URLSearchParams();
    params.set("q", query);
    params.set("limit", "5");
    params.set("offset", "0");
    return apiFetch<Tag[]>(`/tags?${params.toString()}`);
  },

  saveTags(docId: string, tagIDs: string[]): Promise<void> {
    return apiFetch(`/documents/${docId}/tags`, {
      method: "PUT",
      body: JSON.stringify({ tag_ids: tagIDs }),
    });
  },
};
