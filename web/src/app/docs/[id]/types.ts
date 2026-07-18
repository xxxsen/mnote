import type { ReactNode } from "react";
import type { MarkdownCommand } from "./commands/markdown-commands";
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
  executeCommand: (command: MarkdownCommand) => void;
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

// SaveDocumentPayload mirrors PUT /documents/:id. base_revision is the
// optimistic-lock precondition; save_seq remains only for rolling compatibility.
export type SaveDocumentPayload = {
  title: string;
  content: string;
  base_revision: number;
  save_seq: number;
};

// SaveDocumentResult is the metadata returned from a save attempt.
// `accepted` reports whether the write was applied; in both branches the
// remaining fields reflect the post-call server state so the client can
// present or resolve a conflict without accepting the stale write. The
// backend never echoes the document body here — when a save is rejected
// the editor keeps its in-progress draft.
export type SaveDocumentResult = {
  id: string;
  accepted: boolean;
  reason?: "" | "revision_conflict";
  version: number;
  content_revision: number;
  content_hash: string;
  content_mtime: number;
  mtime: number;
};

// SaveStatus enumerates the footer states the editor surfaces. The editor
// stays editable in SAVING/QUEUED so the user can keep typing — the queue
// will pick up the latest snapshot on its next iteration. Network, auth and
// server failures enter ERROR, while revision conflicts enter CONFLICT and
// require an explicit user decision.
export type EditorSyncStatus =
  | "SYNCED"
  | "LOCAL_CHANGES"
  | "SAVING"
  | "QUEUED"
  | "ERROR"
  | "CONFLICT";

export type SaveStatus = EditorSyncStatus;

export type InlineTagDropdownItem = {
  key: string;
  type: "use" | "create" | "suggestion";
  tag?: Tag;
  name?: string;
};
