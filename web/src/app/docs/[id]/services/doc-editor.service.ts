import { apiFetch } from "@/lib/api";
import type { DocumentVersionSummary, Share, Tag } from "@/types";
import type {
  DocDetail,
  DocumentLinkDirection,
  DocumentLinksResponse,
  SaveDocumentPayload,
  SaveDocumentResult,
} from "../types";

export type DocumentLinksQuery = {
  include: DocumentLinkDirection[];
  limit?: number;
  incomingCursor?: string;
  outgoingCursor?: string;
};

export const docEditorService = {
  getDocument(docId: string): Promise<DocDetail> {
    return apiFetch<DocDetail>(`/documents/${docId}?include=tags`);
  },

  getDocumentLinks(
    docId: string,
    query: DocumentLinksQuery,
    signal?: AbortSignal,
  ): Promise<DocumentLinksResponse> {
    const params = new URLSearchParams();
    params.set("include", query.include.join(","));
    params.set("limit", String(query.limit ?? 20));
    if (query.incomingCursor) {
      params.set("incoming_cursor", query.incomingCursor);
    }
    if (query.outgoingCursor) {
      params.set("outgoing_cursor", query.outgoingCursor);
    }
    return apiFetch<DocumentLinksResponse>(
      `/documents/${encodeURIComponent(docId)}/links?${params.toString()}`,
      { signal },
    );
  },

  saveDocument(docId: string, payload: SaveDocumentPayload): Promise<SaveDocumentResult> {
    return apiFetch<SaveDocumentResult>(`/documents/${docId}`, {
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
