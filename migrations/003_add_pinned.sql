ALTER TABLE documents ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_documents_user_pinned_ctime ON documents(user_id, pinned, ctime);
