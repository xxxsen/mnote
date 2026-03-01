export interface Document {
  id: string;
  user_id: string;
  title: string;
  content: string;
  summary: string;
  state: number;
  pinned: number;
  starred: number;
  ctime: number;
  mtime: number;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
  pinned: number;
  ctime: number;
  mtime: number;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version: number;
  title: string;
  content: string;
  ctime: number;
}

export interface DocumentVersionSummary {
  id: string;
  document_id: string;
  version: number;
  title: string;
  ctime: number;
}

export interface Share {
  id: string;
  user_id: string;
  document_id: string;
  token: string;
  state: number;
  expires_at: number;
  password?: string;
  has_password?: boolean;
  permission: number;
  allow_download: number;
  ctime: number;
  mtime: number;
}

export interface ShareComment {
  id: string;
  share_id: string;
  document_id: string;
  root_id: string;
  reply_to_id: string;
  author: string;
  content: string;
  replies?: ShareComment[];
  reply_count?: number;
  state: number;
  ctime: number;
  mtime: number;
}

export interface ShareCommentsPage {
  items: ShareComment[];
  total: number;
}

export interface PublicShareDetail {
  document: Document;
  author: string;
  tags: Tag[];
  permission: number;
  allow_download: number;
  expires_at: number;
}

export interface Template {
  id: string;
  user_id?: string;
  name: string;
  description: string;
  content: string;
  default_tag_ids: string[];
  built_in: number;
  ctime: number;
  mtime: number;
}

export interface TemplateMeta {
  id: string;
  user_id?: string;
  name: string;
  description: string;
  default_tag_ids: string[];
  built_in: number;
  ctime: number;
  mtime: number;
}

export interface Asset {
  id: string;
  user_id: string;
  file_key: string;
  url: string;
  name: string;
  content_type: string;
  size: number;
  ctime: number;
  mtime: number;
  ref_count: number;
}
