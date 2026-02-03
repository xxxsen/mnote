CREATE TABLE IF NOT EXISTS document_summaries (
  document_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  ctime BIGINT NOT NULL,
  mtime BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_document_summaries_user ON document_summaries(user_id);

INSERT INTO document_summaries (document_id, user_id, summary, ctime, mtime)
SELECT d.id, d.user_id, d.summary, d.mtime, d.mtime
FROM documents d
WHERE d.summary <> ''
ON CONFLICT (document_id) DO NOTHING;
