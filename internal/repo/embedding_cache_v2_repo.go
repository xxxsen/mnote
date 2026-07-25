package repo

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/pgvector/pgvector-go"

	"github.com/xxxsen/mnote/internal/model"
)

type EmbeddingCacheV2Repo struct {
	db *sql.DB
}

func NewEmbeddingCacheV2Repo(db *sql.DB) *EmbeddingCacheV2Repo {
	return &EmbeddingCacheV2Repo{db: db}
}

func (r *EmbeddingCacheV2Repo) Get(
	ctx context.Context,
	profileID, taskType, contentHash string,
	minCtime int64,
) ([]float32, bool, error) {
	const query = `
		SELECT embedding
		FROM embedding_cache_v2
		WHERE profile_id = $1
		  AND task_type = $2
		  AND content_hash = $3
		  AND ctime >= $4
	`
	var embedding pgvector.Vector
	if err := conn(ctx, r.db).QueryRowContext(
		ctx,
		query,
		profileID,
		taskType,
		contentHash,
		minCtime,
	).Scan(&embedding); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, false, nil
		}
		return nil, false, fmt.Errorf("get embedding cache v2: %w", err)
	}
	return embedding.Slice(), true, nil
}

func (r *EmbeddingCacheV2Repo) Save(
	ctx context.Context,
	item model.EmbeddingCacheV2,
) error {
	const query = `
		INSERT INTO embedding_cache_v2 (
			profile_id, task_type, content_hash, dimensions, embedding, ctime
		)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (profile_id, task_type, content_hash) DO UPDATE SET
			dimensions = EXCLUDED.dimensions,
			embedding = EXCLUDED.embedding,
			ctime = EXCLUDED.ctime
	`
	if _, err := conn(ctx, r.db).ExecContext(
		ctx,
		query,
		item.ProfileID,
		item.TaskType,
		item.ContentHash,
		item.Dimensions,
		pgvector.NewVector(item.Embedding),
		item.Ctime,
	); err != nil {
		return fmt.Errorf("save embedding cache v2: %w", err)
	}
	return nil
}

func (r *EmbeddingCacheV2Repo) Delete(
	ctx context.Context,
	profileID, taskType, contentHash string,
) error {
	const query = `
		DELETE FROM embedding_cache_v2
		WHERE profile_id = $1 AND task_type = $2 AND content_hash = $3
	`
	if _, err := conn(ctx, r.db).ExecContext(
		ctx,
		query,
		profileID,
		taskType,
		contentHash,
	); err != nil {
		return fmt.Errorf("delete embedding cache v2: %w", err)
	}
	return nil
}

func (r *EmbeddingCacheV2Repo) DeleteBeforeBatch(
	ctx context.Context,
	cutoff int64,
	limit int,
) (int64, error) {
	if limit <= 0 {
		return 0, nil
	}
	const query = `
		WITH expired AS (
			SELECT profile_id, task_type, content_hash
			FROM embedding_cache_v2
			WHERE ctime < $1
			ORDER BY ctime
			LIMIT $2
		)
		DELETE FROM embedding_cache_v2 AS cache
		USING expired
		WHERE cache.profile_id = expired.profile_id
		  AND cache.task_type = expired.task_type
		  AND cache.content_hash = expired.content_hash
	`
	result, err := conn(ctx, r.db).ExecContext(ctx, query, cutoff, limit)
	if err != nil {
		return 0, fmt.Errorf("delete embedding cache v2 batch: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("embedding cache v2 rows affected: %w", err)
	}
	return affected, nil
}

func (r *EmbeddingCacheV2Repo) GetCooldown(
	ctx context.Context,
	profileID, providerName string,
) (*model.EmbeddingProviderCooldown, bool, error) {
	const query = `
		SELECT profile_id, provider_name, blocked_until, last_error_code, mtime
		FROM embedding_provider_cooldowns
		WHERE profile_id = $1 AND provider_name = $2
	`
	var cooldown model.EmbeddingProviderCooldown
	if err := conn(ctx, r.db).QueryRowContext(
		ctx,
		query,
		profileID,
		providerName,
	).Scan(
		&cooldown.ProfileID,
		&cooldown.ProviderName,
		&cooldown.BlockedUntil,
		&cooldown.LastErrorCode,
		&cooldown.Mtime,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, false, nil
		}
		return nil, false, fmt.Errorf("get embedding provider cooldown: %w", err)
	}
	return &cooldown, true, nil
}

func (r *EmbeddingCacheV2Repo) SaveCooldown(
	ctx context.Context,
	cooldown model.EmbeddingProviderCooldown,
) error {
	if len(cooldown.LastErrorCode) > 64 {
		cooldown.LastErrorCode = cooldown.LastErrorCode[:64]
	}
	const query = `
		INSERT INTO embedding_provider_cooldowns (
			profile_id, provider_name, blocked_until, last_error_code, mtime
		)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (profile_id, provider_name) DO UPDATE SET
			blocked_until = GREATEST(
				embedding_provider_cooldowns.blocked_until,
				EXCLUDED.blocked_until
			),
			last_error_code = EXCLUDED.last_error_code,
			mtime = EXCLUDED.mtime
	`
	if _, err := conn(ctx, r.db).ExecContext(
		ctx,
		query,
		cooldown.ProfileID,
		cooldown.ProviderName,
		cooldown.BlockedUntil,
		cooldown.LastErrorCode,
		cooldown.Mtime,
	); err != nil {
		return fmt.Errorf("save embedding provider cooldown: %w", err)
	}
	return nil
}
