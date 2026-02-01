CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS document_embeddings (
    document_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    embedding vector NOT NULL,
    content_hash TEXT NOT NULL,
    mtime BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_doc_embeddings_user ON document_embeddings(user_id);
