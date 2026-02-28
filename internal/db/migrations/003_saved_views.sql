CREATE TABLE IF NOT EXISTS saved_views (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  search TEXT NOT NULL DEFAULT '',
  tag_id TEXT NOT NULL DEFAULT '',
  show_starred INTEGER NOT NULL DEFAULT 0,
  show_shared INTEGER NOT NULL DEFAULT 0,
  ctime BIGINT NOT NULL,
  mtime BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_saved_views_user_mtime ON saved_views(user_id, mtime DESC);
