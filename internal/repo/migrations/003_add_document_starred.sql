ALTER TABLE documents ADD COLUMN starred INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_documents_user_starred_mtime ON documents(user_id, starred, mtime);
