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

// SaveDocumentPayload mirrors the PUT /documents/:id body. base_revision is
// mandatory after BE-3 and is checked against documents.content_revision to
// detect lost updates between concurrent editors.
export type SaveDocumentPayload = {
  title: string;
  content: string;
  base_revision: number;
};

// SaveDocumentResult is the server snapshot the API returns on a successful
// save. The frontend uses it to advance its own revision/hash/mtime refs so
// the next save sends the correct base_revision and the footer shows the
// server-side timestamp instead of a guess derived from Date.now().
export type SaveDocumentResult = {
  id: string;
  version: number;
  content_revision: number;
  content_hash: string;
  content_mtime: number;
  mtime: number;
};

// SaveDocumentConflict carries the minimal current-server snapshot returned
// inside the conflict response body so the editor can resync its revision
// without overwriting the user's in-progress edits.
export type SaveDocumentConflict = {
  id: string;
  title: string;
  content: string;
  content_revision: number;
  content_mtime: number;
};

// SaveStatus enumerates the footer states the editor surfaces. The editor
// stays editable in SAVING/QUEUED so the user can keep typing — the queue
// will pick up the latest snapshot on its next iteration. CONFLICT and
// ERROR require the user's attention before progress can resume: CONFLICT
// means the server saw a newer revision and the local draft must be
// resubmitted against the fresh base revision; ERROR means the request
// itself failed for non-conflict reasons (network, auth, server fault).
export type SaveStatus = "SYNCED" | "SAVING" | "QUEUED" | "CONFLICT" | "ERROR";

export type InlineTagDropdownItem = {
  key: string;
  type: "use" | "create" | "suggestion";
  tag?: Tag;
  name?: string;
};
