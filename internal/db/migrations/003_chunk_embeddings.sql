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
