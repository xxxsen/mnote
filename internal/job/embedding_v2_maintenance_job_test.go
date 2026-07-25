package job

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
)

type fakeEmbeddingV2MaintenanceRepo struct {
	retireCalls  int
	cleanupCalls int
	cleanup      []int64
	err          error
	generations  []model.EmbeddingGeneration
	stats        *model.EmbeddingGenerationStats
	cooldowns    []model.EmbeddingProviderCooldown
}

func (repository *fakeEmbeddingV2MaintenanceRepo) RetireExpiredStandbys(
	context.Context,
	int64,
) (int64, error) {
	repository.retireCalls++
	if repository.err != nil {
		return 0, repository.err
	}
	return 1, nil
}

func (repository *fakeEmbeddingV2MaintenanceRepo) CleanupRetiredGenerationBatch(
	context.Context,
	int64,
	int,
) (int64, error) {
	repository.cleanupCalls++
	if repository.cleanupCalls > len(repository.cleanup) {
		return 0, nil
	}
	return repository.cleanup[repository.cleanupCalls-1], nil
}

func (repository *fakeEmbeddingV2MaintenanceRepo) ListGenerations(
	context.Context,
) ([]model.EmbeddingGeneration, error) {
	return repository.generations, nil
}

func (repository *fakeEmbeddingV2MaintenanceRepo) GenerationStats(
	context.Context,
	string,
	int64,
) (*model.EmbeddingGenerationStats, error) {
	return repository.stats, nil
}

func (repository *fakeEmbeddingV2MaintenanceRepo) ListCooldowns(
	context.Context,
	string,
) ([]model.EmbeddingProviderCooldown, error) {
	return repository.cooldowns, nil
}

type fakeEmbeddingV2CacheMaintenanceRepo struct {
	calls   int
	deleted []int64
	err     error
}

func (repository *fakeEmbeddingV2CacheMaintenanceRepo) DeleteBeforeBatch(
	context.Context,
	int64,
	int,
) (int64, error) {
	repository.calls++
	if repository.err != nil {
		return 0, repository.err
	}
	if repository.calls > len(repository.deleted) {
		return 0, nil
	}
	return repository.deleted[repository.calls-1], nil
}

func TestEmbeddingV2MaintenanceJob_Run(t *testing.T) {
	embeddings := &fakeEmbeddingV2MaintenanceRepo{
		cleanup: []int64{500, 0},
		generations: []model.EmbeddingGeneration{{
			ID:        "generation",
			ProfileID: "profile",
			Status:    model.EmbeddingGenerationActive,
		}},
		stats: &model.EmbeddingGenerationStats{
			Generation: model.EmbeddingGeneration{
				ID:        "generation",
				ProfileID: "profile",
				Status:    model.EmbeddingGenerationActive,
			},
			Profile:         model.EmbeddingProfile{ID: "profile"},
			NormalDocuments: 4,
			Current:         3,
			Pending:         1,
		},
		cooldowns: []model.EmbeddingProviderCooldown{{
			ProfileID:     "profile",
			ProviderName:  "provider",
			BlockedUntil:  1,
			LastErrorCode: "rate_limited",
		}},
	}
	cache := &fakeEmbeddingV2CacheMaintenanceRepo{deleted: []int64{1000, 0}}
	job := NewEmbeddingV2MaintenanceJob(embeddings, cache)

	require.NoError(t, job.Run(context.Background()))
	assert.Equal(t, "embedding_v2_maintenance", job.Name())
	assert.Equal(t, 1, embeddings.retireCalls)
	assert.Equal(t, 2, embeddings.cleanupCalls)
	assert.Equal(t, 2, cache.calls)
}

func TestEmbeddingV2MaintenanceJob_StopsOnMaintenanceError(t *testing.T) {
	expected := errors.New("database unavailable")
	job := NewEmbeddingV2MaintenanceJob(
		&fakeEmbeddingV2MaintenanceRepo{err: expected},
		&fakeEmbeddingV2CacheMaintenanceRepo{},
	)
	err := job.Run(context.Background())
	require.Error(t, err)
	assert.ErrorIs(t, err, expected)
	assert.Contains(t, err.Error(), "retire expired embedding standby")
}
