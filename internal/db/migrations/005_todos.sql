CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  marker_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  content TEXT NOT NULL,
  due_date TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  ctime BIGINT NOT NULL,
  mtime BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_todos_user_date ON todos(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_todos_document ON todos(document_id);
CREATE INDEX IF NOT EXISTS idx_todos_user_done ON todos(user_id, done);
CREATE UNIQUE INDEX IF NOT EXISTS idx_todos_user_doc_marker ON todos(user_id, document_id, marker_id);
