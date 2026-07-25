package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/ai"
	"github.com/xxxsen/mnote/internal/model"
)

type fakeEmbeddingV2BootstrapRepo struct {
	stats         model.EmbeddingGenerationStats
	statsCalls    int
	readyAfter    int
	statsErr      error
	validateErr   error
	activateErr   error
	validateCalls int
	activateCalls int
}

func (repo *fakeEmbeddingV2BootstrapRepo) GenerationStats(
	context.Context,
	string,
	int64,
) (*model.EmbeddingGenerationStats, error) {
	repo.statsCalls++
	if repo.statsErr != nil {
		return nil, repo.statsErr
	}
	stats := repo.stats
	if repo.readyAfter > 0 {
		stats.CanActivate = repo.statsCalls >= repo.readyAfter
	}
	return &stats, nil
}

func (repo *fakeEmbeddingV2BootstrapRepo) ValidateGenerationVectors(
	context.Context,
	string,
	int,
) error {
	repo.validateCalls++
	return repo.validateErr
}

func (repo *fakeEmbeddingV2BootstrapRepo) ActivateGeneration(
	context.Context,
	string,
	int64,
	int64,
) error {
	repo.activateCalls++
	return repo.activateErr
}

func testEmbeddingV2Bootstrap(
	t *testing.T,
	repository embeddingV2BootstrapRepo,
	embedder ai.ProfileEmbedder,
) *EmbeddingV2BootstrapWorker {
	t.Helper()
	worker, err := NewEmbeddingV2BootstrapWorker(
		repository,
		map[string]ai.ProfileEmbedder{"profile": embedder},
		EmbeddingV2BootstrapWorkerConfig{
			GenerationID:  "generation",
			Standby:       time.Hour,
			PollInterval:  time.Millisecond,
			RetryInterval: 2 * time.Millisecond,
		},
	)
	require.NoError(t, err)
	worker.now = func() time.Time { return time.Unix(100, 0) }
	return worker
}

func TestEmbeddingV2BootstrapWorker_ActivatesInitialGeneration(t *testing.T) {
	profile := model.EmbeddingProfile{
		ID:               "profile",
		Fingerprint:      "fingerprint",
		Dimensions:       2,
		QueryTaskType:    "query",
		DocumentTaskType: "document",
	}
	repository := &fakeEmbeddingV2BootstrapRepo{
		stats: model.EmbeddingGenerationStats{
			Generation: model.EmbeddingGeneration{
				ID:     "generation",
				Status: model.EmbeddingGenerationBuilding,
			},
			Profile: profile,
		},
		readyAfter: 2,
	}
	embedder := &fakeWorkerProfileEmbedder{profile: ai.ProfileIdentity{
		ID:          profile.ID,
		Fingerprint: profile.Fingerprint,
		Dimensions:  profile.Dimensions,
	}}
	worker := testEmbeddingV2Bootstrap(t, repository, embedder)

	require.NoError(t, worker.Run(context.Background()))
	assert.Equal(t, 2, repository.statsCalls)
	assert.Equal(t, 1, repository.validateCalls)
	assert.Equal(t, 1, repository.activateCalls)
	assert.Equal(t, 2, embedder.calls)
}

func TestEmbeddingV2BootstrapWorker_DefersTransientPreflightFailure(t *testing.T) {
	profile := model.EmbeddingProfile{
		ID:               "profile",
		Fingerprint:      "fingerprint",
		Dimensions:       2,
		QueryTaskType:    "query",
		DocumentTaskType: "document",
	}
	repository := &fakeEmbeddingV2BootstrapRepo{
		stats: model.EmbeddingGenerationStats{
			Generation: model.EmbeddingGeneration{
				ID:     "generation",
				Status: model.EmbeddingGenerationBuilding,
			},
			Profile:     profile,
			CanActivate: true,
		},
	}
	embedder := &fakeWorkerProfileEmbedder{
		profile: ai.ProfileIdentity{
			ID:          profile.ID,
			Fingerprint: profile.Fingerprint,
			Dimensions:  profile.Dimensions,
		},
		err: &ai.ProviderError{
			Code:    ai.ErrorTransport,
			Message: "temporary failure",
		},
	}
	worker := testEmbeddingV2Bootstrap(t, repository, embedder)

	retryAfter, done, err := worker.activateIfReady(context.Background())
	require.NoError(t, err)
	assert.False(t, done)
	assert.Equal(t, 2*time.Millisecond, retryAfter)
	assert.Zero(t, repository.validateCalls)
	assert.Zero(t, repository.activateCalls)
}

func TestEmbeddingV2BootstrapWorker_ReturnsRepositoryError(t *testing.T) {
	expected := errors.New("database unavailable")
	repository := &fakeEmbeddingV2BootstrapRepo{statsErr: expected}
	embedder := &fakeWorkerProfileEmbedder{profile: ai.ProfileIdentity{
		ID:          "profile",
		Fingerprint: "fingerprint",
		Dimensions:  2,
	}}
	worker := testEmbeddingV2Bootstrap(t, repository, embedder)

	err := worker.Run(context.Background())
	require.Error(t, err)
	assert.ErrorIs(t, err, expected)
}

func TestNewEmbeddingV2BootstrapWorker_RejectsInvalidConfig(t *testing.T) {
	_, err := NewEmbeddingV2BootstrapWorker(
		&fakeEmbeddingV2BootstrapRepo{},
		map[string]ai.ProfileEmbedder{"profile": &fakeWorkerProfileEmbedder{}},
		EmbeddingV2BootstrapWorkerConfig{},
	)
	assert.ErrorIs(t, err, errEmbeddingV2BootstrapConfig)
}
