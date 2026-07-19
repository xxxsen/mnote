\set ON_ERROR_STOP on

-- Read-only post-migration, pre-release audit. Every result must be zero
-- except the migration ledger listing. Run with:
--   psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/audit-db.sql

SELECT version, filename, checksum, applied_at
FROM schema_migrations
ORDER BY filename;

SELECT 'duplicate_normalized_email' AS check_name, COUNT(*) AS violations
FROM (
    SELECT LOWER(BTRIM(email))
    FROM users
    GROUP BY LOWER(BTRIM(email))
    HAVING COUNT(*) > 1
) duplicates
UNION ALL
SELECT 'duplicate_active_share', COUNT(*)
FROM (
    SELECT user_id, document_id
    FROM shares
    WHERE state = 1
    GROUP BY user_id, document_id
    HAVING COUNT(*) > 1
) duplicates
UNION ALL
SELECT 'orphan_document_tag', COUNT(*)
FROM document_tags rel
WHERE NOT EXISTS (
    SELECT 1 FROM documents doc
    WHERE doc.user_id = rel.user_id AND doc.id = rel.document_id
) OR NOT EXISTS (
    SELECT 1 FROM tags tag
    WHERE tag.user_id = rel.user_id AND tag.id = rel.tag_id
)
UNION ALL
SELECT 'orphan_document_asset', COUNT(*)
FROM document_assets rel
WHERE NOT EXISTS (
    SELECT 1 FROM documents doc
    WHERE doc.user_id = rel.user_id AND doc.id = rel.document_id
) OR NOT EXISTS (
    SELECT 1 FROM assets asset
    WHERE asset.user_id = rel.user_id AND asset.id = rel.asset_id
)
UNION ALL
SELECT 'orphan_document_link', COUNT(*)
FROM document_links rel
WHERE NOT EXISTS (
    SELECT 1 FROM documents doc
    WHERE doc.user_id = rel.user_id AND doc.id = rel.source_id
) OR NOT EXISTS (
    SELECT 1 FROM documents doc
    WHERE doc.user_id = rel.user_id AND doc.id = rel.target_id
)
UNION ALL
SELECT 'orphan_document_version', COUNT(*)
FROM document_versions rel
WHERE NOT EXISTS (
    SELECT 1 FROM documents doc
    WHERE doc.user_id = rel.user_id AND doc.id = rel.document_id
)
UNION ALL
SELECT 'orphan_share', COUNT(*)
FROM shares rel
WHERE NOT EXISTS (
    SELECT 1 FROM documents doc
    WHERE doc.user_id = rel.user_id AND doc.id = rel.document_id
)
UNION ALL
SELECT 'orphan_summary', COUNT(*)
FROM document_summaries rel
WHERE NOT EXISTS (
    SELECT 1 FROM documents doc
    WHERE doc.user_id = rel.user_id AND doc.id = rel.document_id
)
UNION ALL
SELECT 'orphan_embedding', COUNT(*)
FROM document_embeddings rel
WHERE NOT EXISTS (
    SELECT 1 FROM documents doc
    WHERE doc.user_id = rel.user_id AND doc.id = rel.document_id
)
UNION ALL
SELECT 'orphan_chunk_embedding', COUNT(*)
FROM chunk_embeddings rel
WHERE NOT EXISTS (
    SELECT 1 FROM documents doc
    WHERE doc.user_id = rel.user_id AND doc.id = rel.document_id
)
UNION ALL
SELECT 'orphan_oauth_account', COUNT(*)
FROM oauth_accounts rel
WHERE NOT EXISTS (
    SELECT 1 FROM users usr WHERE usr.id = rel.user_id
)
UNION ALL
SELECT 'orphan_import_note', COUNT(*)
FROM import_job_notes rel
WHERE NOT EXISTS (
    SELECT 1 FROM import_jobs job
    WHERE job.user_id = rel.user_id AND job.id = rel.job_id
)
ORDER BY check_name;

SELECT 'invalid_share_state' AS check_name, COUNT(*) AS violations
FROM shares
WHERE state NOT IN (1, 2)
UNION ALL
SELECT 'invalid_embedding_status', COUNT(*)
FROM document_embeddings
WHERE embedding_status NOT IN ('pending', 'running', 'succeeded', 'failed')
UNION ALL
SELECT 'invalid_import_status', COUNT(*)
FROM import_jobs
WHERE status NOT IN ('parsing', 'ready', 'running', 'done', 'failed')
UNION ALL
SELECT 'invalid_import_note_status', COUNT(*)
FROM import_job_notes
WHERE status NOT IN ('pending', 'done', 'failed', 'skipped')
UNION ALL
SELECT 'invalid_summary_status', COUNT(*)
FROM document_summaries
WHERE status NOT IN ('pending', 'running', 'succeeded', 'failed')
UNION ALL
SELECT 'invalid_asset_status', COUNT(*)
FROM assets
WHERE status NOT IN ('pending', 'ready', 'failed')
ORDER BY check_name;
