package job

import (
	"context"
	"fmt"
	"time"
)

type expiryCleaner interface {
	DeleteBefore(ctx context.Context, cutoff int64) (int64, error)
}

type EmbeddingCacheCleanupJob struct {
	repo       expiryCleaner
	maxAgeDays int
}

func NewEmbeddingCacheCleanupJob(repo expiryCleaner, maxAgeDays int) *EmbeddingCacheCleanupJob {
	return &EmbeddingCacheCleanupJob{repo: repo, maxAgeDays: maxAgeDays}
}

func (j *EmbeddingCacheCleanupJob) Name() string {
	return "embedding_cache_cleanup"
}

func (j *EmbeddingCacheCleanupJob) Run(ctx context.Context) error {
	if j.repo == nil {
		return nil
	}
	maxAgeDays := j.maxAgeDays
	if maxAgeDays <= 0 {
		maxAgeDays = 30
	}
	cutoff := time.Now().Add(-time.Duration(maxAgeDays) * 24 * time.Hour).Unix()
	_, err := j.repo.DeleteBefore(ctx, cutoff)
	if err != nil {
		return fmt.Errorf("delete expired cache: %w", err)
	}
	return nil
}
