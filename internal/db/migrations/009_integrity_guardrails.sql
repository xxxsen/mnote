CREATE TABLE IF NOT EXISTS integrity_orphan_archive (
    id BIGSERIAL PRIMARY KEY,
    source_table TEXT NOT NULL,
    source_key JSONB NOT NULL,
    row_data JSONB NOT NULL,
    reason TEXT NOT NULL,
    archived_at BIGINT NOT NULL
);

INSERT INTO integrity_orphan_archive (source_table, source_key, row_data, reason, archived_at)
SELECT
    'document_tags',
    jsonb_build_object('user_id', rel.user_id, 'document_id', rel.document_id, 'tag_id', rel.tag_id),
    to_jsonb(rel),
    'document or tag missing, or ownership mismatch',
    EXTRACT(EPOCH FROM clock_timestamp())::BIGINT
FROM document_tags rel
LEFT JOIN documents doc
    ON doc.user_id = rel.user_id AND doc.id = rel.document_id
LEFT JOIN tags tag
    ON tag.user_id = rel.user_id AND tag.id = rel.tag_id
WHERE doc.id IS NULL OR tag.id IS NULL;

DELETE FROM document_tags rel
WHERE NOT EXISTS (
    SELECT 1 FROM documents doc
    WHERE doc.user_id = rel.user_id AND doc.id = rel.document_id
) OR NOT EXISTS (
    SELECT 1 FROM tags tag
    WHERE tag.user_id = rel.user_id AND tag.id = rel.tag_id
);

INSERT INTO integrity_orphan_archive (source_table, source_key, row_data, reason, archived_at)
SELECT
    'document_assets',
    jsonb_build_object('user_id', rel.user_id, 'document_id', rel.document_id, 'asset_id', rel.asset_id),
    to_jsonb(rel),
    'document or asset missing, or ownership mismatch',
    EXTRACT(EPOCH FROM clock_timestamp())::BIGINT
FROM document_assets rel
LEFT JOIN documents doc
    ON doc.user_id = rel.user_id AND doc.id = rel.document_id
LEFT JOIN assets asset
    ON asset.user_id = rel.user_id AND asset.id = rel.asset_id
WHERE doc.id IS NULL OR asset.id IS NULL;

DELETE FROM document_assets rel
WHERE NOT EXISTS (
    SELECT 1 FROM documents doc
    WHERE doc.user_id = rel.user_id AND doc.id = rel.document_id
) OR NOT EXISTS (
    SELECT 1 FROM assets asset
    WHERE asset.user_id = rel.user_id AND asset.id = rel.asset_id
);

INSERT INTO integrity_orphan_archive (source_table, source_key, row_data, reason, archived_at)
SELECT
    'document_links',
    jsonb_build_object('user_id', rel.user_id, 'source_id', rel.source_id, 'target_id', rel.target_id),
    to_jsonb(rel),
    'source or target document missing, or ownership mismatch',
    EXTRACT(EPOCH FROM clock_timestamp())::BIGINT
FROM document_links rel
LEFT JOIN documents source_doc
    ON source_doc.user_id = rel.user_id AND source_doc.id = rel.source_id
LEFT JOIN documents target_doc
    ON target_doc.user_id = rel.user_id AND target_doc.id = rel.target_id
WHERE source_doc.id IS NULL OR target_doc.id IS NULL;

DELETE FROM document_links rel
WHERE NOT EXISTS (
    SELECT 1 FROM documents doc
    WHERE doc.user_id = rel.user_id AND doc.id = rel.source_id
) OR NOT EXISTS (
    SELECT 1 FROM documents doc
    WHERE doc.user_id = rel.user_id AND doc.id = rel.target_id
);

INSERT INTO integrity_orphan_archive (source_table, source_key, row_data, reason, archived_at)
SELECT
    'document_versions',
    jsonb_build_object('id', rel.id),
    to_jsonb(rel),
    'document missing or ownership mismatch',
    EXTRACT(EPOCH FROM clock_timestamp())::BIGINT
FROM document_versions rel
LEFT JOIN documents doc
    ON doc.user_id = rel.user_id AND doc.id = rel.document_id
WHERE doc.id IS NULL;

DELETE FROM document_versions rel
WHERE NOT EXISTS (
    SELECT 1 FROM documents doc
    WHERE doc.user_id = rel.user_id AND doc.id = rel.document_id
);

INSERT INTO integrity_orphan_archive (source_table, source_key, row_data, reason, archived_at)
SELECT
    'shares',
    jsonb_build_object('id', rel.id),
    to_jsonb(rel),
    'document missing or ownership mismatch',
    EXTRACT(EPOCH FROM clock_timestamp())::BIGINT
FROM shares rel
LEFT JOIN documents doc
    ON doc.user_id = rel.user_id AND doc.id = rel.document_id
WHERE doc.id IS NULL;

DELETE FROM shares rel
WHERE NOT EXISTS (
    SELECT 1 FROM documents doc
    WHERE doc.user_id = rel.user_id AND doc.id = rel.document_id
);

INSERT INTO integrity_orphan_archive (source_table, source_key, row_data, reason, archived_at)
SELECT
    'document_summaries',
    jsonb_build_object('document_id', rel.document_id),
    to_jsonb(rel),
    'document missing or ownership mismatch',
    EXTRACT(EPOCH FROM clock_timestamp())::BIGINT
FROM document_summaries rel
LEFT JOIN documents doc
    ON doc.user_id = rel.user_id AND doc.id = rel.document_id
WHERE doc.id IS NULL;

DELETE FROM document_summaries rel
WHERE NOT EXISTS (
    SELECT 1 FROM documents doc
    WHERE doc.user_id = rel.user_id AND doc.id = rel.document_id
);

INSERT INTO integrity_orphan_archive (source_table, source_key, row_data, reason, archived_at)
SELECT
    'document_embeddings',
    jsonb_build_object('document_id', rel.document_id),
    to_jsonb(rel),
    'document missing or ownership mismatch',
    EXTRACT(EPOCH FROM clock_timestamp())::BIGINT
FROM document_embeddings rel
LEFT JOIN documents doc
    ON doc.user_id = rel.user_id AND doc.id = rel.document_id
WHERE doc.id IS NULL;

DELETE FROM document_embeddings rel
WHERE NOT EXISTS (
    SELECT 1 FROM documents doc
    WHERE doc.user_id = rel.user_id AND doc.id = rel.document_id
);

INSERT INTO integrity_orphan_archive (source_table, source_key, row_data, reason, archived_at)
SELECT
    'chunk_embeddings',
    jsonb_build_object('chunk_id', rel.chunk_id),
    to_jsonb(rel) - 'embedding',
    'document missing or ownership mismatch',
    EXTRACT(EPOCH FROM clock_timestamp())::BIGINT
FROM chunk_embeddings rel
LEFT JOIN documents doc
    ON doc.user_id = rel.user_id AND doc.id = rel.document_id
WHERE doc.id IS NULL;

DELETE FROM chunk_embeddings rel
WHERE NOT EXISTS (
    SELECT 1 FROM documents doc
    WHERE doc.user_id = rel.user_id AND doc.id = rel.document_id
);

INSERT INTO integrity_orphan_archive (source_table, source_key, row_data, reason, archived_at)
SELECT
    'oauth_accounts',
    jsonb_build_object('id', rel.id),
    to_jsonb(rel),
    'user missing',
    EXTRACT(EPOCH FROM clock_timestamp())::BIGINT
FROM oauth_accounts rel
LEFT JOIN users usr ON usr.id = rel.user_id
WHERE usr.id IS NULL;

DELETE FROM oauth_accounts rel
WHERE NOT EXISTS (SELECT 1 FROM users usr WHERE usr.id = rel.user_id);

INSERT INTO integrity_orphan_archive (source_table, source_key, row_data, reason, archived_at)
SELECT
    'import_job_notes',
    jsonb_build_object('id', rel.id),
    to_jsonb(rel),
    'import job missing or ownership mismatch',
    EXTRACT(EPOCH FROM clock_timestamp())::BIGINT
FROM import_job_notes rel
LEFT JOIN import_jobs job
    ON job.user_id = rel.user_id AND job.id = rel.job_id
WHERE job.id IS NULL;

DELETE FROM import_job_notes rel
WHERE NOT EXISTS (
    SELECT 1 FROM import_jobs job
    WHERE job.user_id = rel.user_id AND job.id = rel.job_id
);

WITH RECURSIVE invalid_comments AS (
    SELECT rel.share_id, rel.id
    FROM share_comments rel
    LEFT JOIN shares share
        ON share.id = rel.share_id AND share.document_id = rel.document_id
    LEFT JOIN share_comments root_comment
        ON rel.root_id <> ''
       AND root_comment.share_id = rel.share_id
       AND root_comment.id = rel.root_id
    LEFT JOIN share_comments reply_comment
        ON rel.reply_to_id <> ''
       AND reply_comment.share_id = rel.share_id
       AND reply_comment.id = rel.reply_to_id
    WHERE share.id IS NULL
       OR (rel.root_id <> '' AND root_comment.id IS NULL)
       OR (rel.reply_to_id <> '' AND reply_comment.id IS NULL)
    UNION
    SELECT child.share_id, child.id
    FROM share_comments child
    JOIN invalid_comments parent
      ON parent.share_id = child.share_id
     AND (child.root_id = parent.id OR child.reply_to_id = parent.id)
)
INSERT INTO integrity_orphan_archive (source_table, source_key, row_data, reason, archived_at)
SELECT
    'share_comments',
    jsonb_build_object('id', rel.id),
    to_jsonb(rel),
    'share, document, root, reply target, or ancestor is invalid',
    EXTRACT(EPOCH FROM clock_timestamp())::BIGINT
FROM share_comments rel
JOIN invalid_comments invalid
  ON invalid.share_id = rel.share_id AND invalid.id = rel.id;

WITH RECURSIVE invalid_comments AS (
    SELECT rel.share_id, rel.id
    FROM share_comments rel
    LEFT JOIN shares share
        ON share.id = rel.share_id AND share.document_id = rel.document_id
    LEFT JOIN share_comments root_comment
        ON rel.root_id <> ''
       AND root_comment.share_id = rel.share_id
       AND root_comment.id = rel.root_id
    LEFT JOIN share_comments reply_comment
        ON rel.reply_to_id <> ''
       AND reply_comment.share_id = rel.share_id
       AND reply_comment.id = rel.reply_to_id
    WHERE share.id IS NULL
       OR (rel.root_id <> '' AND root_comment.id IS NULL)
       OR (rel.reply_to_id <> '' AND reply_comment.id IS NULL)
    UNION
    SELECT child.share_id, child.id
    FROM share_comments child
    JOIN invalid_comments parent
      ON parent.share_id = child.share_id
     AND (child.root_id = parent.id OR child.reply_to_id = parent.id)
)
DELETE FROM share_comments rel
USING invalid_comments invalid
WHERE invalid.share_id = rel.share_id AND invalid.id = rel.id;

WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY user_id, document_id
            ORDER BY mtime DESC, ctime DESC, id DESC
        ) AS row_number
    FROM shares
    WHERE state = 1
)
UPDATE shares
SET state = 2,
    mtime = EXTRACT(EPOCH FROM clock_timestamp())::BIGINT
WHERE id IN (SELECT id FROM ranked WHERE row_number > 1);

UPDATE share_comments SET root_id = NULL WHERE root_id = '';
UPDATE share_comments SET reply_to_id = NULL WHERE reply_to_id = '';
ALTER TABLE share_comments ALTER COLUMN root_id DROP DEFAULT;
ALTER TABLE share_comments ALTER COLUMN root_id DROP NOT NULL;
ALTER TABLE share_comments ALTER COLUMN reply_to_id DROP DEFAULT;
ALTER TABLE share_comments ALTER COLUMN reply_to_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_documents_user_id ON documents(user_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_tags_user_id ON tags(user_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_assets_user_id ON assets(user_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_import_jobs_user_id ON import_jobs(user_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_shares_id_document ON shares(id, document_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_share_comments_share_id ON share_comments(share_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_share_per_document
    ON shares(user_id, document_id) WHERE state = 1;

ALTER TABLE document_tags
    ADD CONSTRAINT fk_document_tags_document
    FOREIGN KEY (user_id, document_id) REFERENCES documents(user_id, id)
    ON DELETE CASCADE NOT VALID;
ALTER TABLE document_tags
    ADD CONSTRAINT fk_document_tags_tag
    FOREIGN KEY (user_id, tag_id) REFERENCES tags(user_id, id)
    ON DELETE CASCADE NOT VALID;
ALTER TABLE document_assets
    ADD CONSTRAINT fk_document_assets_document
    FOREIGN KEY (user_id, document_id) REFERENCES documents(user_id, id)
    ON DELETE CASCADE NOT VALID;
ALTER TABLE document_assets
    ADD CONSTRAINT fk_document_assets_asset
    FOREIGN KEY (user_id, asset_id) REFERENCES assets(user_id, id)
    ON DELETE CASCADE NOT VALID;
ALTER TABLE document_links
    ADD CONSTRAINT fk_document_links_source
    FOREIGN KEY (user_id, source_id) REFERENCES documents(user_id, id)
    ON DELETE CASCADE NOT VALID;
ALTER TABLE document_links
    ADD CONSTRAINT fk_document_links_target
    FOREIGN KEY (user_id, target_id) REFERENCES documents(user_id, id)
    ON DELETE CASCADE NOT VALID;
ALTER TABLE document_versions
    ADD CONSTRAINT fk_document_versions_document
    FOREIGN KEY (user_id, document_id) REFERENCES documents(user_id, id)
    ON DELETE CASCADE NOT VALID;
ALTER TABLE shares
    ADD CONSTRAINT fk_shares_document
    FOREIGN KEY (user_id, document_id) REFERENCES documents(user_id, id)
    ON DELETE CASCADE NOT VALID;
ALTER TABLE document_summaries
    ADD CONSTRAINT fk_document_summaries_document
    FOREIGN KEY (user_id, document_id) REFERENCES documents(user_id, id)
    ON DELETE CASCADE NOT VALID;
ALTER TABLE document_embeddings
    ADD CONSTRAINT fk_document_embeddings_document
    FOREIGN KEY (user_id, document_id) REFERENCES documents(user_id, id)
    ON DELETE CASCADE NOT VALID;
ALTER TABLE chunk_embeddings
    ADD CONSTRAINT fk_chunk_embeddings_document
    FOREIGN KEY (user_id, document_id) REFERENCES documents(user_id, id)
    ON DELETE CASCADE NOT VALID;
ALTER TABLE oauth_accounts
    ADD CONSTRAINT fk_oauth_accounts_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE NOT VALID;
ALTER TABLE import_job_notes
    ADD CONSTRAINT fk_import_job_notes_job
    FOREIGN KEY (user_id, job_id) REFERENCES import_jobs(user_id, id)
    ON DELETE CASCADE NOT VALID;
ALTER TABLE share_comments
    ADD CONSTRAINT fk_share_comments_share_document
    FOREIGN KEY (share_id, document_id) REFERENCES shares(id, document_id)
    ON DELETE CASCADE NOT VALID;
ALTER TABLE share_comments
    ADD CONSTRAINT fk_share_comments_root
    FOREIGN KEY (share_id, root_id) REFERENCES share_comments(share_id, id)
    ON DELETE CASCADE NOT VALID;
ALTER TABLE share_comments
    ADD CONSTRAINT fk_share_comments_reply
    FOREIGN KEY (share_id, reply_to_id) REFERENCES share_comments(share_id, id)
    ON DELETE CASCADE NOT VALID;

ALTER TABLE document_tags VALIDATE CONSTRAINT fk_document_tags_document;
ALTER TABLE document_tags VALIDATE CONSTRAINT fk_document_tags_tag;
ALTER TABLE document_assets VALIDATE CONSTRAINT fk_document_assets_document;
ALTER TABLE document_assets VALIDATE CONSTRAINT fk_document_assets_asset;
ALTER TABLE document_links VALIDATE CONSTRAINT fk_document_links_source;
ALTER TABLE document_links VALIDATE CONSTRAINT fk_document_links_target;
ALTER TABLE document_versions VALIDATE CONSTRAINT fk_document_versions_document;
ALTER TABLE shares VALIDATE CONSTRAINT fk_shares_document;
ALTER TABLE document_summaries VALIDATE CONSTRAINT fk_document_summaries_document;
ALTER TABLE document_embeddings VALIDATE CONSTRAINT fk_document_embeddings_document;
ALTER TABLE chunk_embeddings VALIDATE CONSTRAINT fk_chunk_embeddings_document;
ALTER TABLE oauth_accounts VALIDATE CONSTRAINT fk_oauth_accounts_user;
ALTER TABLE import_job_notes VALIDATE CONSTRAINT fk_import_job_notes_job;
ALTER TABLE share_comments VALIDATE CONSTRAINT fk_share_comments_share_document;
ALTER TABLE share_comments VALIDATE CONSTRAINT fk_share_comments_root;
ALTER TABLE share_comments VALIDATE CONSTRAINT fk_share_comments_reply;

ALTER TABLE shares
    ADD CONSTRAINT chk_shares_state CHECK (state IN (1, 2)) NOT VALID;
ALTER TABLE document_embeddings
    ADD CONSTRAINT chk_document_embeddings_status
    CHECK (embedding_status IN ('pending', 'running', 'succeeded', 'failed')) NOT VALID;
ALTER TABLE shares VALIDATE CONSTRAINT chk_shares_state;
ALTER TABLE document_embeddings VALIDATE CONSTRAINT chk_document_embeddings_status;
