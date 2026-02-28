CREATE TABLE IF NOT EXISTS share_comments (
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT 'Guest',
  content TEXT NOT NULL,
  state INTEGER NOT NULL DEFAULT 1,
  ctime BIGINT NOT NULL,
  mtime BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_share_comments_share_ctime ON share_comments(share_id, ctime DESC);
