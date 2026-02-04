package repo

import (
	"context"
	"database/sql"

	"github.com/pgvector/pgvector-go"
	"github.com/xxxsen/mnote/internal/model"
)

type EmbeddingCacheRepo struct {
	db *sql.DB
}

func NewEmbeddingCacheRepo(db *sql.DB) *EmbeddingCacheRepo {
	return &EmbeddingCacheRepo{db: db}
}

func (r *EmbeddingCacheRepo) Get(ctx context.Context, modelName, taskType, contentHash string) ([]float32, bool, error) {
	const query = `
		SELECT embedding
		FROM embedding_cache
		WHERE model_name = $1 AND task_type = $2 AND content_hash = $3
	`
	row := r.db.QueryRowContext(ctx, query, modelName, taskType, contentHash)
	var embedding pgvector.Vector
	if err := row.Scan(&embedding); err != nil {
		if err == sql.ErrNoRows {
			return nil, false, nil
		}
		return nil, false, err
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
	_, err := r.db.ExecContext(ctx, query,
		item.ModelName,
		item.TaskType,
		item.ContentHash,
		pgvector.NewVector(item.Embedding),
		item.Ctime,
	)
	return err
}

func (r *EmbeddingCacheRepo) DeleteBefore(ctx context.Context, cutoff int64) (int64, error) {
	const query = `DELETE FROM embedding_cache WHERE ctime < $1`
	res, err := r.db.ExecContext(ctx, query, cutoff)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
