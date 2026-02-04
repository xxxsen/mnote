package job

import (
	"context"
	"time"

	"github.com/xxxsen/mnote/internal/repo"
)

type EmbeddingCacheCleanupJob struct {
	repo       *repo.EmbeddingCacheRepo
	maxAgeDays int
}

func NewEmbeddingCacheCleanupJob(repo *repo.EmbeddingCacheRepo, maxAgeDays int) *EmbeddingCacheCleanupJob {
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
	return err
}
