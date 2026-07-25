-- Embedding V2 keeps immutable vector-space profiles separate from rebuild
-- generations. The existing V1 tables remain untouched so the application can
-- build a shadow generation and roll back without affecting document storage
-- or the legacy semantic-search path.

CREATE TABLE embedding_profiles (
    id TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL UNIQUE,
    space_id TEXT NOT NULL,
    model TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    metric TEXT NOT NULL,
    query_task_type TEXT NOT NULL,
    document_task_type TEXT NOT NULL,
    chunker_version INTEGER NOT NULL,
    ctime BIGINT NOT NULL,
    CONSTRAINT chk_embedding_profiles_id CHECK (id <> ''),
    CONSTRAINT chk_embedding_profiles_fingerprint CHECK (fingerprint <> ''),
    CONSTRAINT chk_embedding_profiles_space CHECK (space_id <> '' AND model <> ''),
    CONSTRAINT chk_embedding_profiles_dimensions
        CHECK (dimensions IN (384, 768, 1024, 1536)),
    CONSTRAINT chk_embedding_profiles_metric CHECK (metric = 'cosine'),
    CONSTRAINT chk_embedding_profiles_chunker CHECK (chunker_version = 2)
);

CREATE TABLE embedding_generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id TEXT NOT NULL REFERENCES embedding_profiles(id) ON DELETE RESTRICT,
    status TEXT NOT NULL,
    reason TEXT NOT NULL,
    standby_until BIGINT NOT NULL DEFAULT 0,
    ctime BIGINT NOT NULL,
    mtime BIGINT NOT NULL,
    activated_at BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT chk_embedding_generations_status
        CHECK (status IN ('building', 'active', 'standby', 'retired', 'failed')),
    CONSTRAINT chk_embedding_generations_reason
        CHECK (reason IN ('initial', 'model_change', 'rechunk', 'manual_repair'))
);

CREATE UNIQUE INDEX uniq_embedding_generations_active
    ON embedding_generations (status)
    WHERE status = 'active';

CREATE UNIQUE INDEX uniq_embedding_generations_building
    ON embedding_generations (status)
    WHERE status = 'building';

CREATE INDEX idx_embedding_generations_profile_status
    ON embedding_generations (profile_id, status, mtime);

CREATE TABLE embedding_jobs (
    generation_id UUID NOT NULL
        REFERENCES embedding_generations(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    desired_content_hash TEXT NOT NULL,
    desired_revision BIGINT NOT NULL,
    status TEXT NOT NULL,
    available_at BIGINT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    claim_token UUID,
    lease_until BIGINT NOT NULL DEFAULT 0,
    last_error_code TEXT NOT NULL DEFAULT '',
    last_error_message TEXT NOT NULL DEFAULT '',
    ctime BIGINT NOT NULL,
    mtime BIGINT NOT NULL,
    PRIMARY KEY (generation_id, document_id),
    CONSTRAINT fk_embedding_jobs_document
        FOREIGN KEY (user_id, document_id)
        REFERENCES documents(user_id, id) ON DELETE CASCADE,
    CONSTRAINT chk_embedding_jobs_status
        CHECK (status IN ('pending', 'running', 'failed', 'dead', 'succeeded')),
    CONSTRAINT chk_embedding_jobs_revision CHECK (desired_revision > 0),
    CONSTRAINT chk_embedding_jobs_attempts CHECK (attempts >= 0),
    CONSTRAINT chk_embedding_jobs_error_length
        CHECK (length(last_error_code) <= 64 AND length(last_error_message) <= 500),
    CONSTRAINT chk_embedding_jobs_claim
        CHECK (
            (status = 'running' AND claim_token IS NOT NULL AND lease_until > 0)
            OR
            (status <> 'running' AND claim_token IS NULL AND lease_until = 0)
        )
);

CREATE INDEX idx_embedding_jobs_ready
    ON embedding_jobs (status, available_at, lease_until, mtime);

CREATE INDEX idx_embedding_jobs_generation_ready
    ON embedding_jobs (generation_id, status, available_at, mtime);

CREATE INDEX idx_embedding_jobs_user_document
    ON embedding_jobs (user_id, document_id);

CREATE TABLE document_embedding_indexes (
    generation_id UUID NOT NULL
        REFERENCES embedding_generations(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    indexed_content_hash TEXT NOT NULL,
    indexed_revision BIGINT NOT NULL,
    dimensions INTEGER NOT NULL,
    chunk_count INTEGER NOT NULL,
    centroid vector,
    indexed_at BIGINT NOT NULL,
    PRIMARY KEY (generation_id, document_id),
    CONSTRAINT fk_document_embedding_indexes_document
        FOREIGN KEY (user_id, document_id)
        REFERENCES documents(user_id, id) ON DELETE CASCADE,
    CONSTRAINT chk_document_embedding_indexes_dimensions
        CHECK (dimensions IN (384, 768, 1024, 1536)),
    CONSTRAINT chk_document_embedding_indexes_revision CHECK (indexed_revision > 0),
    CONSTRAINT chk_document_embedding_indexes_chunk_count CHECK (chunk_count >= 0),
    CONSTRAINT chk_document_embedding_indexes_centroid
        CHECK (
            (chunk_count = 0 AND centroid IS NULL)
            OR (
                chunk_count > 0
                AND centroid IS NOT NULL
                AND vector_dims(centroid) = dimensions
                AND vector_norm(centroid) > 0
            )
        )
);

CREATE INDEX idx_document_embedding_indexes_user
    ON document_embedding_indexes (generation_id, user_id, document_id);

CREATE TABLE chunk_embeddings_v2 (
    generation_id UUID NOT NULL
        REFERENCES embedding_generations(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    chunk_type TEXT NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER NOT NULL,
    dimensions INTEGER NOT NULL,
    embedding vector NOT NULL,
    ctime BIGINT NOT NULL,
    PRIMARY KEY (generation_id, document_id, position),
    CONSTRAINT fk_chunk_embeddings_v2_document
        FOREIGN KEY (user_id, document_id)
        REFERENCES documents(user_id, id) ON DELETE CASCADE,
    CONSTRAINT chk_chunk_embeddings_v2_position CHECK (position >= 0),
    CONSTRAINT chk_chunk_embeddings_v2_type
        CHECK (chunk_type IN ('title', 'text', 'code', 'mixed')),
    CONSTRAINT chk_chunk_embeddings_v2_tokens CHECK (token_count > 0),
    CONSTRAINT chk_chunk_embeddings_v2_dimensions
        CHECK (
            dimensions IN (384, 768, 1024, 1536)
            AND vector_dims(embedding) = dimensions
            AND vector_norm(embedding) > 0
        )
);

CREATE INDEX idx_chunk_embeddings_v2_generation_user
    ON chunk_embeddings_v2 (generation_id, user_id, document_id);

CREATE INDEX idx_chunk_embeddings_v2_hnsw_384
    ON chunk_embeddings_v2
    USING hnsw ((embedding::vector(384)) vector_cosine_ops)
    WHERE dimensions = 384;

CREATE INDEX idx_chunk_embeddings_v2_hnsw_768
    ON chunk_embeddings_v2
    USING hnsw ((embedding::vector(768)) vector_cosine_ops)
    WHERE dimensions = 768;

CREATE INDEX idx_chunk_embeddings_v2_hnsw_1024
    ON chunk_embeddings_v2
    USING hnsw ((embedding::vector(1024)) vector_cosine_ops)
    WHERE dimensions = 1024;

CREATE INDEX idx_chunk_embeddings_v2_hnsw_1536
    ON chunk_embeddings_v2
    USING hnsw ((embedding::vector(1536)) vector_cosine_ops)
    WHERE dimensions = 1536;

CREATE INDEX idx_document_embedding_indexes_hnsw_384
    ON document_embedding_indexes
    USING hnsw ((centroid::vector(384)) vector_cosine_ops)
    WHERE dimensions = 384 AND centroid IS NOT NULL;

CREATE INDEX idx_document_embedding_indexes_hnsw_768
    ON document_embedding_indexes
    USING hnsw ((centroid::vector(768)) vector_cosine_ops)
    WHERE dimensions = 768 AND centroid IS NOT NULL;

CREATE INDEX idx_document_embedding_indexes_hnsw_1024
    ON document_embedding_indexes
    USING hnsw ((centroid::vector(1024)) vector_cosine_ops)
    WHERE dimensions = 1024 AND centroid IS NOT NULL;

CREATE INDEX idx_document_embedding_indexes_hnsw_1536
    ON document_embedding_indexes
    USING hnsw ((centroid::vector(1536)) vector_cosine_ops)
    WHERE dimensions = 1536 AND centroid IS NOT NULL;

CREATE TABLE embedding_cache_v2 (
    profile_id TEXT NOT NULL REFERENCES embedding_profiles(id) ON DELETE CASCADE,
    task_type TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    embedding vector NOT NULL,
    ctime BIGINT NOT NULL,
    PRIMARY KEY (profile_id, task_type, content_hash),
    CONSTRAINT chk_embedding_cache_v2_dimensions
        CHECK (
            dimensions IN (384, 768, 1024, 1536)
            AND vector_dims(embedding) = dimensions
            AND vector_norm(embedding) > 0
        )
);

CREATE INDEX idx_embedding_cache_v2_ctime
    ON embedding_cache_v2 (ctime);

CREATE TABLE embedding_provider_cooldowns (
    profile_id TEXT NOT NULL REFERENCES embedding_profiles(id) ON DELETE CASCADE,
    provider_name TEXT NOT NULL,
    blocked_until BIGINT NOT NULL,
    last_error_code TEXT NOT NULL DEFAULT '',
    mtime BIGINT NOT NULL,
    PRIMARY KEY (profile_id, provider_name),
    CONSTRAINT chk_embedding_provider_cooldowns_provider CHECK (provider_name <> ''),
    CONSTRAINT chk_embedding_provider_cooldowns_error_length
        CHECK (length(last_error_code) <= 64)
);
