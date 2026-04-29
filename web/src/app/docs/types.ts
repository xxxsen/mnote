import type { Document, Tag } from "@/types";

export interface DocumentWithTags extends Document {
  tag_ids?: string[];
  tags?: Tag[];
  share_token?: string;
  score?: number;
}

export interface TagSummary {
  id: string;
  name: string;
  pinned: number;
  count: number;
}

export type ImportStep = "upload" | "parsing" | "preview" | "importing" | "done";
export type ImportMode = "skip" | "overwrite" | "append";
export type ImportSource = "hedgedoc" | "notes";

export type SharedItem = {
  id: string;
  title: string;
  summary?: string;
  tag_ids?: string[];
  mtime: number;
  token: string;
};

export type ImportPreview = {
  notes_count: number;
  tags_count: number;
  conflicts: number;
  samples: { title: string; tags: string[] }[];
};

export type ImportReport = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  failed_titles: string[];
};

export type SavedView = {
  id: string;
  name: string;
  search: string;
  selectedTag: string;
  showStarred: boolean;
  showShared: boolean;
};

export type SavedViewDTO = {
  id: string;
  name: string;
  search: string;
  tag_id: string;
  show_starred: number;
  show_shared: number;
};
