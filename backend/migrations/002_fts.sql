CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts
USING fts5(
  document_id,
  user_id,
  title,
  content
);
