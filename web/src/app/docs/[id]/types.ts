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
  action: (ctx: SlashActionContext) => void;
};

export type DocDetail = {
  document: Document;
  tag_ids: string[];
  tags?: Tag[];
};

export type SaveDocumentPayload = {
  title: string;
  content: string;
};
