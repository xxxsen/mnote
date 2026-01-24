export interface Document {
  id: string;
  user_id: string;
  title: string;
  content: string;
  state: number;
  ctime: number;
  mtime: number;
}

export interface Tag {
  id: string;
  user_id: string;
  name: string;
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

export interface Share {
  id: string;
  user_id: string;
  document_id: string;
  token: string;
  state: number;
  ctime: number;
  mtime: number;
}
