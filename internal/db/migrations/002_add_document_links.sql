CREATE TABLE IF NOT EXISTS document_links (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  ctime BIGINT NOT NULL,
  PRIMARY KEY (source_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_doc_links_target ON document_links(target_id);
