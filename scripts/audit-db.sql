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
SELECT 'invalid_asset_status', COUNT(*)
FROM assets
WHERE status NOT IN ('pending', 'ready', 'failed')
ORDER BY check_name;

SELECT 'embedding_v2_invalid_profile_fingerprint' AS check_name, COUNT(*) AS violations
FROM embedding_profiles
WHERE fingerprint !~ '^[0-9a-f]{64}$'
   OR fingerprint <> encode(
       digest(
           space_id || E'\n' ||
           model || E'\n' ||
           dimensions::TEXT || E'\n' ||
           metric || E'\n' ||
           query_task_type || E'\n' ||
           document_task_type || E'\n' ||
           chunker_version::TEXT,
           'sha256'
       ),
       'hex'
   )
UNION ALL
SELECT 'embedding_v2_multiple_active', GREATEST(COUNT(*) - 1, 0)
FROM embedding_generations
WHERE status = 'active'
UNION ALL
SELECT 'embedding_v2_multiple_building', GREATEST(COUNT(*) - 1, 0)
FROM embedding_generations
WHERE status = 'building'
UNION ALL
SELECT 'embedding_v2_job_owner_mismatch', COUNT(*)
FROM embedding_jobs job
JOIN documents document ON document.id = job.document_id
WHERE document.user_id <> job.user_id
UNION ALL
SELECT 'embedding_v2_succeeded_without_current_index', COUNT(*)
FROM embedding_jobs job
JOIN embedding_generations generation
  ON generation.id = job.generation_id
JOIN documents document
  ON document.id = job.document_id AND document.user_id = job.user_id
LEFT JOIN document_embedding_indexes index
  ON index.generation_id = job.generation_id
 AND index.document_id = job.document_id
 AND index.user_id = job.user_id
WHERE job.status = 'succeeded'
  AND document.state = 1
  AND (
      generation.status IN ('active', 'building')
      OR (
          generation.status = 'standby'
          AND generation.standby_until > EXTRACT(EPOCH FROM NOW())::BIGINT
      )
  )
  AND (
      index.document_id IS NULL
      OR job.desired_content_hash <> index.indexed_content_hash
      OR job.desired_revision <> index.indexed_revision
      OR index.indexed_content_hash <> document.content_hash
      OR index.indexed_revision <> document.content_revision
  )
UNION ALL
SELECT 'embedding_v2_current_index_drift', COUNT(*)
FROM document_embedding_indexes index
JOIN embedding_generations generation
  ON generation.id = index.generation_id
JOIN documents document
  ON document.id = index.document_id AND document.user_id = index.user_id
WHERE document.state = 1
  AND (
      generation.status IN ('active', 'building')
      OR (
          generation.status = 'standby'
          AND generation.standby_until > EXTRACT(EPOCH FROM NOW())::BIGINT
      )
  )
  AND (
      index.indexed_content_hash <> document.content_hash
      OR index.indexed_revision <> document.content_revision
  )
UNION ALL
SELECT 'embedding_v2_current_index_without_succeeded_job', COUNT(*)
FROM document_embedding_indexes index
JOIN embedding_generations generation
  ON generation.id = index.generation_id
JOIN documents document
  ON document.id = index.document_id AND document.user_id = index.user_id
LEFT JOIN embedding_jobs job
  ON job.generation_id = index.generation_id
 AND job.document_id = index.document_id
 AND job.user_id = index.user_id
 AND job.status = 'succeeded'
 AND job.desired_content_hash = index.indexed_content_hash
 AND job.desired_revision = index.indexed_revision
WHERE document.state = 1
  AND (
      generation.status IN ('active', 'building')
      OR (
          generation.status = 'standby'
          AND generation.standby_until > EXTRACT(EPOCH FROM NOW())::BIGINT
      )
  )
  AND index.indexed_content_hash = document.content_hash
  AND index.indexed_revision = document.content_revision
  AND job.document_id IS NULL
UNION ALL
SELECT 'embedding_v2_chunk_index_dimension_mismatch', COUNT(*)
FROM chunk_embeddings_v2 chunk
JOIN document_embedding_indexes index
  ON index.generation_id = chunk.generation_id
 AND index.document_id = chunk.document_id
 AND index.user_id = chunk.user_id
JOIN embedding_generations generation
  ON generation.id = chunk.generation_id
JOIN embedding_profiles profile
  ON profile.id = generation.profile_id
WHERE (
      generation.status IN ('active', 'building')
      OR (
          generation.status = 'standby'
          AND generation.standby_until > EXTRACT(EPOCH FROM NOW())::BIGINT
      )
  )
  AND (
      chunk.dimensions <> index.dimensions
      OR chunk.dimensions <> profile.dimensions
      OR vector_dims(chunk.embedding) <> chunk.dimensions
      OR vector_norm(chunk.embedding) <= 0
  )
UNION ALL
SELECT 'embedding_v2_index_dimension_mismatch', COUNT(*)
FROM document_embedding_indexes index
JOIN embedding_generations generation
  ON generation.id = index.generation_id
JOIN embedding_profiles profile
  ON profile.id = generation.profile_id
WHERE (
      generation.status IN ('active', 'building')
      OR (
          generation.status = 'standby'
          AND generation.standby_until > EXTRACT(EPOCH FROM NOW())::BIGINT
      )
  )
  AND (
      index.dimensions <> profile.dimensions
      OR (
          index.chunk_count = 0
          AND index.centroid IS NOT NULL
      )
      OR (
          index.chunk_count > 0
          AND (
              index.centroid IS NULL
              OR vector_dims(index.centroid) <> index.dimensions
              OR vector_norm(index.centroid) <= 0
          )
      )
  )
UNION ALL
SELECT 'embedding_v2_chunk_count_mismatch', COUNT(*)
FROM document_embedding_indexes index
JOIN embedding_generations generation
  ON generation.id = index.generation_id
WHERE (
      generation.status IN ('active', 'building')
      OR (
          generation.status = 'standby'
          AND generation.standby_until > EXTRACT(EPOCH FROM NOW())::BIGINT
      )
  )
  AND index.chunk_count <> (
    SELECT COUNT(*)
    FROM chunk_embeddings_v2 chunk
    WHERE chunk.generation_id = index.generation_id
      AND chunk.document_id = index.document_id
      AND chunk.user_id = index.user_id
)
UNION ALL
SELECT 'embedding_v2_orphan_chunk', COUNT(*)
FROM chunk_embeddings_v2 chunk
JOIN embedding_generations generation
  ON generation.id = chunk.generation_id
WHERE (
      generation.status IN ('active', 'building')
      OR (
          generation.status = 'standby'
          AND generation.standby_until > EXTRACT(EPOCH FROM NOW())::BIGINT
      )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM document_embedding_indexes index
    WHERE index.generation_id = chunk.generation_id
      AND index.document_id = chunk.document_id
      AND index.user_id = chunk.user_id
)
UNION ALL
SELECT 'embedding_v2_invalid_cache_vector', COUNT(*)
FROM embedding_cache_v2 cache
JOIN embedding_profiles profile
  ON profile.id = cache.profile_id
WHERE cache.dimensions <> profile.dimensions
   OR vector_dims(cache.embedding) <> cache.dimensions
   OR vector_norm(cache.embedding) <= 0
UNION ALL
SELECT 'embedding_v2_expired_running_lease', COUNT(*)
FROM embedding_jobs
WHERE status = 'running' AND lease_until < EXTRACT(EPOCH FROM NOW())::BIGINT
UNION ALL
SELECT 'embedding_v2_expired_standby', COUNT(*)
FROM embedding_generations
WHERE status = 'standby'
  AND standby_until <= EXTRACT(EPOCH FROM NOW())::BIGINT
ORDER BY check_name;
