ALTER TABLE document_summaries ADD COLUMN IF NOT EXISTS source_content_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE document_summaries ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE document_summaries ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE document_summaries ADD COLUMN IF NOT EXISTS next_retry_at BIGINT NOT NULL DEFAULT 0;
ALTER TABLE document_summaries ADD COLUMN IF NOT EXISTS locked_until BIGINT NOT NULL DEFAULT 0;
ALTER TABLE document_summaries ADD COLUMN IF NOT EXISTS last_error TEXT NOT NULL DEFAULT '';

UPDATE document_summaries summary
SET source_content_hash = document.content_hash,
    status = 'succeeded',
    attempts = 0,
    next_retry_at = 0,
    locked_until = 0,
    last_error = ''
FROM documents document
WHERE document.id = summary.document_id
  AND summary.user_id = document.user_id;

INSERT INTO document_summaries (
    document_id, user_id, summary, source_content_hash, status,
    attempts, next_retry_at, locked_until, last_error, ctime, mtime
)
SELECT
    document.id, document.user_id, '', document.content_hash, 'pending',
    0, 0, 0, '', document.ctime, document.mtime
FROM documents document
WHERE document.state = 1
  AND NOT EXISTS (
      SELECT 1
      FROM document_summaries summary
      WHERE summary.document_id = document.id
  );

ALTER TABLE document_summaries
    ADD CONSTRAINT chk_document_summaries_status
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed')) NOT VALID;
ALTER TABLE document_summaries
    ADD CONSTRAINT chk_document_summaries_attempts
    CHECK (attempts >= 0) NOT VALID;

ALTER TABLE document_summaries VALIDATE CONSTRAINT chk_document_summaries_status;
ALTER TABLE document_summaries VALIDATE CONSTRAINT chk_document_summaries_attempts;

CREATE INDEX IF NOT EXISTS idx_document_summaries_claim
    ON document_summaries(status, next_retry_at, locked_until, mtime);
