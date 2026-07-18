import type { ReactNode } from "react";
import type { Document, Tag } from "@/types";

export type AIAction = "polish" | "generate" | "tags" | "summary";

export type DiffLine = {
  type: "equal" | "add" | "remove";
  left?: string;
  right?: string;
};

export type SimilarDoc = Document & {
  score?: number;
};

export type SlashActionContext = {
  handleFormat: (type: "wrap" | "line", prefix: string, suffix?: string) => void;
  handleInsertTable: () => void;
  insertTextAtCursor: (text: string) => void;
};

export type SlashCommand = {
  id: string;
  label: string;
  icon: ReactNode;
  keywords?: string[];
  action: (ctx: SlashActionContext) => void;
};

export type DocDetail = {
  document: Document;
  tag_ids: string[];
  tags?: Tag[];
};

// SaveDocumentPayload mirrors the PUT /documents/:id body. save_seq is a
// client-side monotonically-increasing sequence number. The backend
// accepts the write only when save_seq is strictly greater than the
// document's current content_revision; lower values are ignored so a
// late-arriving older request can never overwrite a newer save.
export type SaveDocumentPayload = {
  title: string;
  content: string;
  save_seq: number;
};

// SaveDocumentResult is the metadata returned from a save attempt.
// `accepted` reports whether the write was applied; in both branches the
// remaining fields reflect the post-call server state so the client can
// advance its local save_seq without re-fetching the document. The
// backend never echoes the document body here — when a save is rejected
// the editor keeps its in-progress draft.
export type SaveDocumentResult = {
  id: string;
  accepted: boolean;
  version: number;
  content_revision: number;
  content_hash: string;
  content_mtime: number;
  mtime: number;
};

// SaveStatus enumerates the footer states the editor surfaces. The editor
// stays editable in SAVING/QUEUED so the user can keep typing — the queue
// will pick up the latest snapshot on its next iteration. ERROR surfaces
// non-acceptance failures (network, auth, server fault); a stale save_seq
// is not an error and does not flip the status.
export type SaveStatus = "SYNCED" | "SAVING" | "QUEUED" | "ERROR";

export type InlineTagDropdownItem = {
  key: string;
  type: "use" | "create" | "suggestion";
  tag?: Tag;
  name?: string;
};
