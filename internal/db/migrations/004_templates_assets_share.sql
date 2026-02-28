ALTER TABLE shares ADD COLUMN IF NOT EXISTS expires_at BIGINT NOT NULL DEFAULT 0;
ALTER TABLE shares ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE shares ADD COLUMN IF NOT EXISTS permission INTEGER NOT NULL DEFAULT 1;
ALTER TABLE shares ADD COLUMN IF NOT EXISTS allow_download INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  variables_json TEXT NOT NULL DEFAULT '[]',
  default_tag_ids_json TEXT NOT NULL DEFAULT '[]',
  ctime BIGINT NOT NULL,
  mtime BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_templates_user_mtime ON templates(user_id, mtime DESC);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  file_key TEXT NOT NULL,
  url TEXT NOT NULL,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  ctime BIGINT NOT NULL,
  mtime BIGINT NOT NULL,
  UNIQUE(user_id, file_key)
);

CREATE INDEX IF NOT EXISTS idx_assets_user_mtime ON assets(user_id, mtime DESC);

CREATE TABLE IF NOT EXISTS document_assets (
  user_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  ctime BIGINT NOT NULL,
  PRIMARY KEY (user_id, document_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_document_assets_asset ON document_assets(user_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_document_assets_doc ON document_assets(user_id, document_id);
