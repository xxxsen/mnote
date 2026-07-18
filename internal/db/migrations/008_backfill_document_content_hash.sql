-- Backfill documents.content_hash for legacy rows that lack an embedding row
-- and therefore came out of 006 with content_hash = ''. The Go save path
-- writes sha256(title || '\n' || content) hex; we recompute the same value
-- here so the embedding stale query stops reporting these rows as drifted
-- once a successful embedding pass aligns them.
--
-- Rationale:
--   - 006 only inherited content_hash from an existing document_embeddings
--     row. Documents that never had embeddings stayed at ''.
--   - With content_hash = '' the stale query keeps returning the document
--     because '' will never equal a real hex digest written by the worker.
--   - The worker now also writes documents.content_hash on success, but the
--     first scan after upgrade still needs a non-empty starting value so
--     the success path can recognize the row as already up to date.
--
-- pgcrypto is required for digest(). It is part of the standard postgres
-- contrib bundle in every supported version, so we declare it locally
-- instead of demanding it be present already.
--
-- Operational note: CREATE EXTENSION typically requires a superuser (or a
-- role explicitly granted CREATE on the database for trusted extensions on
-- PG 13+). If the application role cannot create extensions, ask a DBA to
-- pre-install pgcrypto once with `CREATE EXTENSION IF NOT EXISTS pgcrypto;`
-- as superuser before this migration runs; the IF NOT EXISTS clause keeps
-- the step idempotent and safe to re-execute.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE documents
SET content_hash = encode(digest(title || E'\n' || content, 'sha256'), 'hex')
WHERE content_hash = '';
