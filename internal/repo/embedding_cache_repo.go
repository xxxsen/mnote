package repo

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/pgvector/pgvector-go"

	"github.com/xxxsen/mnote/internal/model"
)

type EmbeddingCacheRepo struct {
	db *sql.DB
}

func NewEmbeddingCacheRepo(db *sql.DB) *EmbeddingCacheRepo {
	return &EmbeddingCacheRepo{db: db}
}

func (r *EmbeddingCacheRepo) Get(
	ctx context.Context, modelName, taskType, contentHash string,
) ([]float32, bool, error) {
	const query = `
		SELECT embedding
		FROM embedding_cache
		WHERE model_name = $1 AND task_type = $2 AND content_hash = $3
	`
	row := conn(ctx, r.db).QueryRowContext(ctx, query, modelName, taskType, contentHash)
	var embedding pgvector.Vector
	if err := row.Scan(&embedding); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, false, nil
		}
		return nil, false, fmt.Errorf("scan embedding cache: %w", err)
	}
	return embedding.Slice(), true, nil
}

func (r *EmbeddingCacheRepo) Save(ctx context.Context, item *model.EmbeddingCache) error {
	const query = `
		INSERT INTO embedding_cache (model_name, task_type, content_hash, embedding, ctime)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (model_name, task_type, content_hash) DO UPDATE SET
			embedding = EXCLUDED.embedding,
			ctime = EXCLUDED.ctime
	`
	if _, err := conn(ctx, r.db).ExecContext(ctx, query,
		item.ModelName,
		item.TaskType,
		item.ContentHash,
		pgvector.NewVector(item.Embedding),
		item.Ctime,
	); err != nil {
		return fmt.Errorf("save embedding cache: %w", err)
	}
	return nil
}

func (r *EmbeddingCacheRepo) DeleteBefore(ctx context.Context, cutoff int64) (int64, error) {
	const query = `DELETE FROM embedding_cache WHERE ctime < $1`
	res, err := conn(ctx, r.db).ExecContext(ctx, query, cutoff)
	if err != nil {
		return 0, fmt.Errorf("delete embedding cache: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("rows affected: %w", err)
	}
	return n, nil
}
