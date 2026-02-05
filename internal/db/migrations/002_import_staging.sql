CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  require_content INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  tags_json TEXT NOT NULL DEFAULT '[]',
  report_json TEXT NOT NULL DEFAULT '{}',
  ctime BIGINT NOT NULL,
  mtime BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_user_ctime ON import_jobs(user_id, ctime);
CREATE INDEX IF NOT EXISTS idx_import_jobs_ctime ON import_jobs(ctime);

CREATE TABLE IF NOT EXISTS import_job_notes (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT '',
  ctime BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_import_job_notes_job_user_pos ON import_job_notes(job_id, user_id, position);
CREATE INDEX IF NOT EXISTS idx_import_job_notes_ctime ON import_job_notes(ctime);
