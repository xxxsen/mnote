ALTER TABLE tags ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_tags_user_pinned_mtime ON tags(user_id, pinned, mtime);
