-- BE-2/BE-3: track body changes separately from metadata mtime so that
-- summary/tag/star updates do not retrigger embedding rebuilds, and provide
-- an authoritative revision number used by optimistic concurrency control on
-- the save path.

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS content_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS content_mtime BIGINT NOT NULL DEFAULT 0;
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS content_revision BIGINT NOT NULL DEFAULT 1;

-- Backfill content_mtime so existing documents have a deterministic ordering
-- key for the embedding stale query. We avoid hashing the body in pure SQL to
-- stay independent of optional pgcrypto and instead inherit the
-- already-recorded hash for documents that have a prior embedding row. Rows
-- without an embedding keep content_hash = '' which is unequal to any future
-- computed hash, so the embedding job will (correctly) treat them as stale.
UPDATE documents
SET content_mtime = mtime
WHERE content_mtime = 0;

UPDATE documents d
SET content_hash = e.content_hash
FROM document_embeddings e
WHERE e.document_id = d.id AND d.content_hash = '' AND e.content_hash <> '';

-- Backfill content_revision so that the first save after the upgrade does
-- not collide with the highest pre-existing document_versions.version. The
-- save path writes document_versions.version = documents.content_revision,
-- so leaving the default of 1 would re-collide with the (user_id,
-- document_id, version) unique index on databases that already have history.
-- The predicate `content_revision = 1` keeps this idempotent: rows whose
-- revision was already advanced (e.g. by a previous partial run) are not
-- touched on a re-run.
UPDATE documents d
SET content_revision = COALESCE(
    (SELECT MAX(version) FROM document_versions v
     WHERE v.user_id = d.user_id AND v.document_id = d.id),
    1
)
WHERE content_revision = 1;

CREATE INDEX IF NOT EXISTS idx_documents_content_mtime
    ON documents(content_mtime);

-- BE-2 embedding state machine columns. embedding_status drives the queue
-- (pending/succeeded/failed); attempts/next_retry_at/locked_until support
-- claim leases and exponential backoff for retries.
ALTER TABLE document_embeddings
    ADD COLUMN IF NOT EXISTS embedding_status TEXT NOT NULL DEFAULT 'succeeded';
ALTER TABLE document_embeddings
    ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE document_embeddings
    ADD COLUMN IF NOT EXISTS next_retry_at BIGINT NOT NULL DEFAULT 0;
ALTER TABLE document_embeddings
    ADD COLUMN IF NOT EXISTS locked_until BIGINT NOT NULL DEFAULT 0;
ALTER TABLE document_embeddings
    ADD COLUMN IF NOT EXISTS last_error TEXT NOT NULL DEFAULT '';

-- Reset historical embedding rows to a clean succeeded state. Future runs
-- will only re-mark them as pending if documents.content_hash diverges.
UPDATE document_embeddings
SET embedding_status = 'succeeded',
    attempts = 0,
    next_retry_at = 0,
    locked_until = 0,
    last_error = ''
WHERE embedding_status IS NULL OR embedding_status = '';

CREATE INDEX IF NOT EXISTS idx_doc_embeddings_retry
    ON document_embeddings(embedding_status, next_retry_at, locked_until);
