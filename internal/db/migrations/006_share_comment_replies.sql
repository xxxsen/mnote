ALTER TABLE share_comments ADD COLUMN IF NOT EXISTS root_id TEXT NOT NULL DEFAULT '';
ALTER TABLE share_comments ADD COLUMN IF NOT EXISTS reply_to_id TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_share_comments_root ON share_comments(share_id, root_id, ctime);
