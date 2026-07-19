ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'skip';
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS locked_until BIGINT NOT NULL DEFAULT 0;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS next_retry_at BIGINT NOT NULL DEFAULT 0;
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS last_error TEXT NOT NULL DEFAULT '';

ALTER TABLE import_job_notes ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE import_job_notes ADD COLUMN IF NOT EXISTS target_document_id TEXT;
ALTER TABLE import_job_notes ADD COLUMN IF NOT EXISTS result_action TEXT;
ALTER TABLE import_job_notes ADD COLUMN IF NOT EXISTS last_error TEXT NOT NULL DEFAULT '';
ALTER TABLE import_job_notes ADD COLUMN IF NOT EXISTS mtime BIGINT;

UPDATE import_job_notes SET mtime = ctime WHERE mtime IS NULL;
ALTER TABLE import_job_notes ALTER COLUMN mtime SET NOT NULL;

ALTER TABLE import_jobs
    ADD CONSTRAINT chk_import_jobs_status
    CHECK (status IN ('parsing', 'ready', 'running', 'done', 'failed')) NOT VALID;
ALTER TABLE import_jobs
    ADD CONSTRAINT chk_import_jobs_mode
    CHECK (mode IN ('skip', 'overwrite', 'append')) NOT VALID;
ALTER TABLE import_jobs
    ADD CONSTRAINT chk_import_jobs_attempts
    CHECK (attempts >= 0 AND attempts <= 5) NOT VALID;
ALTER TABLE import_job_notes
    ADD CONSTRAINT chk_import_job_notes_status
    CHECK (status IN ('pending', 'done', 'failed', 'skipped')) NOT VALID;
ALTER TABLE import_job_notes
    ADD CONSTRAINT chk_import_job_notes_result_action
    CHECK (result_action IS NULL OR result_action IN ('created', 'updated', 'skipped', 'failed')) NOT VALID;

ALTER TABLE import_jobs VALIDATE CONSTRAINT chk_import_jobs_status;
ALTER TABLE import_jobs VALIDATE CONSTRAINT chk_import_jobs_mode;
ALTER TABLE import_jobs VALIDATE CONSTRAINT chk_import_jobs_attempts;
ALTER TABLE import_job_notes VALIDATE CONSTRAINT chk_import_job_notes_status;
ALTER TABLE import_job_notes VALIDATE CONSTRAINT chk_import_job_notes_result_action;

CREATE INDEX IF NOT EXISTS idx_import_jobs_claim
    ON import_jobs(status, next_retry_at, locked_until, ctime);
CREATE INDEX IF NOT EXISTS idx_import_jobs_cleanup
    ON import_jobs(status, mtime, id);
CREATE INDEX IF NOT EXISTS idx_import_job_notes_pending
    ON import_job_notes(job_id, user_id, status, position);

