CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  ctime INTEGER NOT NULL,
  mtime INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  state INTEGER NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  ctime INTEGER NOT NULL,
  mtime INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_user_mtime ON documents(user_id, mtime);
CREATE INDEX IF NOT EXISTS idx_documents_user_pinned_ctime ON documents(user_id, pinned, ctime);

CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  ctime INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_doc_version
ON document_versions(user_id, document_id, version);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  ctime INTEGER NOT NULL,
  mtime INTEGER NOT NULL,
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS document_tags (
  user_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (user_id, document_id, tag_id)
);

CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  state INTEGER NOT NULL,
  ctime INTEGER NOT NULL,
  mtime INTEGER NOT NULL
);
