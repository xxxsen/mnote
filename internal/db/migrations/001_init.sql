CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  ctime BIGINT NOT NULL,
  mtime BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  state INTEGER NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  starred INTEGER NOT NULL DEFAULT 0,
  ctime BIGINT NOT NULL,
  mtime BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_user_mtime ON documents(user_id, mtime);
CREATE INDEX IF NOT EXISTS idx_documents_user_pinned_ctime ON documents(user_id, pinned, ctime);
CREATE INDEX IF NOT EXISTS idx_documents_user_starred_mtime ON documents(user_id, starred, mtime);

CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  ctime BIGINT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_doc_version
ON document_versions(user_id, document_id, version);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  ctime BIGINT NOT NULL,
  mtime BIGINT NOT NULL,
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tags_user_pinned_mtime ON tags(user_id, pinned, mtime);

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
  ctime BIGINT NOT NULL,
  mtime BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  ctime BIGINT NOT NULL,
  mtime BIGINT NOT NULL,
  UNIQUE(provider, provider_user_id),
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user ON oauth_accounts(user_id);

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  ctime BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_email_codes_email_purpose_ctime ON email_verification_codes(email, purpose, ctime);

-- Embeddings
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS document_embeddings (
    document_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    mtime BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_doc_embeddings_user ON document_embeddings(user_id);

CREATE TABLE IF NOT EXISTS chunk_embeddings (
    chunk_id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding vector NOT NULL,
    token_count INT NOT NULL,
    chunk_type TEXT NOT NULL,
    position INT NOT NULL,
    mtime BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_doc ON chunk_embeddings(document_id);
CREATE INDEX IF NOT EXISTS idx_chunk_embeddings_user ON chunk_embeddings(user_id);

CREATE TABLE IF NOT EXISTS document_summaries (
  document_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  ctime BIGINT NOT NULL,
  mtime BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_document_summaries_user ON document_summaries(user_id);

