package service

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/ai"
	"github.com/xxxsen/mnote/internal/model"
)

type fakeEmbeddingV2WorkerRepo struct {
	completed       bool
	completeApplied bool
	chunks          []model.ChunkEmbeddingV2
	centroid        []float32
	failed          bool
	failureCode     string
	permanent       bool
	maxAttempts     int
	renewed         bool
	renewResult     bool
	renewErr        error
	renewStarted    chan struct{}
	waitForCancel   bool
	claimErr        error
}

func (repo *fakeEmbeddingV2WorkerRepo) ClaimJobs(
	context.Context,
	model.EmbeddingGenerationStatus,
	int,
	int64,
	int64,
) ([]model.EmbeddingJobClaim, error) {
	return nil, repo.claimErr
}

func (repo *fakeEmbeddingV2WorkerRepo) RenewClaim(
	ctx context.Context,
	_ string,
	_ string,
	_ string,
	_ int64,
	_ int64,
) (bool, error) {
	repo.renewed = true
	if repo.renewStarted != nil {
		close(repo.renewStarted)
	}
	if repo.waitForCancel {
		<-ctx.Done()
		return false, ctx.Err()
	}
	return repo.renewResult, repo.renewErr
}

func (repo *fakeEmbeddingV2WorkerRepo) CompleteClaim(
	_ context.Context,
	_ model.EmbeddingJobClaim,
	chunks []model.ChunkEmbeddingV2,
	centroid []float32,
	_ int64,
) (bool, error) {
	repo.completed = true
	repo.chunks = chunks
	repo.centroid = centroid
	return repo.completeApplied, nil
}

func (repo *fakeEmbeddingV2WorkerRepo) MarkClaimFailed(
	_ context.Context,
	_, _, _ string,
	code, _ string,
	_, _ int64,
	maxAttempts int,
	permanent bool,
) (bool, error) {
	repo.failed = true
	repo.failureCode = code
	repo.permanent = permanent
	repo.maxAttempts = maxAttempts
	return true, nil
}

type fakeWorkerProfileEmbedder struct {
	profile            ai.ProfileIdentity
	err                error
	calls              int
	blockUntilCanceled bool
}

func (embedder *fakeWorkerProfileEmbedder) Profile() ai.ProfileIdentity {
	return embedder.profile
}

func (embedder *fakeWorkerProfileEmbedder) EmbedBatch(
	ctx context.Context,
	request ai.EmbeddingRequest,
) (ai.EmbeddingResult, error) {
	embedder.calls++
	if embedder.blockUntilCanceled {
		<-ctx.Done()
		return ai.EmbeddingResult{}, &ai.ProviderError{
			Code:    ai.ErrorCanceled,
			Message: "request was canceled",
			Cause:   ctx.Err(),
		}
	}
	if embedder.err != nil {
		return ai.EmbeddingResult{}, embedder.err
	}
	vectors := make([][]float32, len(request.Inputs))
	for index := range vectors {
		vectors[index] = []float32{1, 0}
	}
	return ai.EmbeddingResult{Vectors: vectors, ProviderName: "provider"}, nil
}

func testEmbeddingV2Claim() model.EmbeddingJobClaim {
	profile := model.EmbeddingProfile{
		ID:               "profile",
		Fingerprint:      "fingerprint",
		SpaceID:          "space",
		Model:            "model",
		Dimensions:       2,
		Metric:           "cosine",
		QueryTaskType:    "query",
		DocumentTaskType: "document",
		ChunkerVersion:   2,
	}
	return model.EmbeddingJobClaim{
		EmbeddingJob: model.EmbeddingJob{
			GenerationID:       "generation",
			DocumentID:         "document",
			UserID:             "user",
			DesiredContentHash: "hash",
			DesiredRevision:    1,
			Status:             model.EmbeddingJobRunning,
			Attempts:           1,
			ClaimToken:         "claim",
		},
		GenerationStatus: model.EmbeddingGenerationBuilding,
		Profile:          profile,
		Title:            "Title",
		Content:          "# Section\nBody content.",
	}
}

func newTestEmbeddingV2Worker(
	t *testing.T,
	repository embeddingV2WorkerRepo,
	embedder ai.ProfileEmbedder,
) *EmbeddingV2Worker {
	t.Helper()
	worker, err := NewEmbeddingV2Worker(
		repository,
		map[string]ai.ProfileEmbedder{"profile": embedder},
		EmbeddingV2WorkerConfig{
			Concurrency:   1,
			BatchSize:     2,
			Lease:         2 * time.Hour,
			RenewInterval: time.Hour,
			MaxAttempts:   10,
			PollInterval:  time.Millisecond,
		},
	)
	require.NoError(t, err)
	return worker
}

func TestEmbeddingV2Worker_ProcessClaimBatchesAndCompletes(t *testing.T) {
	repository := &fakeEmbeddingV2WorkerRepo{completeApplied: true}
	identity := testEmbeddingV2Claim().Profile
	embedder := &fakeWorkerProfileEmbedder{profile: ai.ProfileIdentity{
		ID:               identity.ID,
		Fingerprint:      identity.Fingerprint,
		SpaceID:          identity.SpaceID,
		Model:            identity.Model,
		Dimensions:       identity.Dimensions,
		QueryTaskType:    identity.QueryTaskType,
		DocumentTaskType: identity.DocumentTaskType,
	}}
	worker := newTestEmbeddingV2Worker(t, repository, embedder)
	require.NoError(t, worker.processClaim(context.Background(), testEmbeddingV2Claim()))
	assert.True(t, repository.completed)
	assert.False(t, repository.failed)
	require.NotEmpty(t, repository.chunks)
	require.Len(t, repository.centroid, 2)
	for _, chunk := range repository.chunks {
		assert.Equal(t, 2, len(chunk.Embedding))
	}
}

func TestEmbeddingV2Worker_PermanentProviderErrorBecomesDead(t *testing.T) {
	repository := &fakeEmbeddingV2WorkerRepo{}
	claim := testEmbeddingV2Claim()
	embedder := &fakeWorkerProfileEmbedder{
		profile: ai.ProfileIdentity{
			ID:          claim.Profile.ID,
			Fingerprint: claim.Profile.Fingerprint,
			SpaceID:     claim.Profile.SpaceID,
			Model:       claim.Profile.Model,
			Dimensions:  claim.Profile.Dimensions,
		},
		err: &ai.ProviderError{
			Code:    ai.ErrorUnauthorized,
			Message: "secret upstream response",
		},
	}
	worker := newTestEmbeddingV2Worker(t, repository, embedder)
	require.NoError(t, worker.processClaim(context.Background(), claim))
	assert.True(t, repository.failed)
	assert.Equal(t, string(ai.ErrorUnauthorized), repository.failureCode)
	assert.True(t, repository.permanent)
	assert.Equal(t, 10, repository.maxAttempts)
}

func TestEmbeddingV2Worker_ConfigurationMismatchFailsPermanently(t *testing.T) {
	repository := &fakeEmbeddingV2WorkerRepo{}
	embedder := &fakeWorkerProfileEmbedder{profile: ai.ProfileIdentity{
		ID:          "profile",
		Fingerprint: "different",
		SpaceID:     "space",
		Model:       "model",
		Dimensions:  2,
	}}
	worker := newTestEmbeddingV2Worker(t, repository, embedder)
	require.NoError(t, worker.processClaim(context.Background(), testEmbeddingV2Claim()))
	assert.True(t, repository.failed)
	assert.True(t, repository.permanent)
}

func TestEmbeddingV2BackoffIsBoundedAndJittered(t *testing.T) {
	first := embeddingV2Backoff(1, "a")
	later := embeddingV2Backoff(20, "b")
	assert.GreaterOrEqual(t, first, time.Minute)
	assert.LessOrEqual(t, first, 72*time.Second)
	assert.GreaterOrEqual(t, later, time.Hour)
	assert.LessOrEqual(t, later, 72*time.Minute)
}

func TestEmbeddingV2Worker_SlotAllocationPreventsGenerationStarvation(t *testing.T) {
	single := &EmbeddingV2Worker{config: EmbeddingV2WorkerConfig{Concurrency: 1}}
	assert.Equal(t, []model.EmbeddingGenerationStatus{
		model.EmbeddingGenerationActive,
		model.EmbeddingGenerationBuilding,
		model.EmbeddingGenerationActive,
		model.EmbeddingGenerationStandby,
	}, single.slotStatuses(0))

	concurrent := &EmbeddingV2Worker{
		config: EmbeddingV2WorkerConfig{Concurrency: 3},
	}
	assert.Equal(t, model.EmbeddingGenerationBuilding, concurrent.slotStatuses(0)[0])
	assert.Equal(t, model.EmbeddingGenerationActive, concurrent.slotStatuses(1)[0])
	assert.Equal(t, model.EmbeddingGenerationActive, concurrent.slotStatuses(2)[0])
}

func TestEmbeddingV2Worker_LostLeaseCancelsProviderWithoutFailureWrite(t *testing.T) {
	repository := &fakeEmbeddingV2WorkerRepo{renewResult: false}
	claim := testEmbeddingV2Claim()
	embedder := &fakeWorkerProfileEmbedder{
		profile: ai.ProfileIdentity{
			ID:          claim.Profile.ID,
			Fingerprint: claim.Profile.Fingerprint,
			SpaceID:     claim.Profile.SpaceID,
			Model:       claim.Profile.Model,
			Dimensions:  claim.Profile.Dimensions,
		},
		blockUntilCanceled: true,
	}
	worker := newTestEmbeddingV2Worker(t, repository, embedder)
	worker.config.Lease = time.Second
	worker.config.RenewInterval = 10 * time.Millisecond

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	require.NoError(t, worker.processClaim(ctx, claim))
	assert.True(t, repository.renewed)
	assert.False(t, repository.completed)
	assert.False(t, repository.failed)
}

func TestEmbeddingV2Worker_ClaimCancellationDoesNotReportRenewalError(t *testing.T) {
	repository := &fakeEmbeddingV2WorkerRepo{
		renewStarted:  make(chan struct{}),
		waitForCancel: true,
	}
	claim := testEmbeddingV2Claim()
	worker := &EmbeddingV2Worker{
		repo: repository,
		config: EmbeddingV2WorkerConfig{
			Lease:         time.Second,
			RenewInterval: time.Millisecond,
		},
		now: time.Now,
	}
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go worker.renewClaim(ctx, cancel, claim, result)

	select {
	case <-repository.renewStarted:
	case <-time.After(time.Second):
		t.Fatal("renewal did not start")
	}
	cancel()

	select {
	case err := <-result:
		require.NoError(t, err)
	case <-time.After(time.Second):
		t.Fatal("renewal did not stop after claim cancellation")
	}
}

func TestEmbeddingV2Worker_ClaimErrorStopsWorker(t *testing.T) {
	expected := context.DeadlineExceeded
	repository := &fakeEmbeddingV2WorkerRepo{claimErr: expected}
	claim := testEmbeddingV2Claim()
	embedder := &fakeWorkerProfileEmbedder{profile: ai.ProfileIdentity{
		ID:          claim.Profile.ID,
		Fingerprint: claim.Profile.Fingerprint,
		SpaceID:     claim.Profile.SpaceID,
		Model:       claim.Profile.Model,
		Dimensions:  claim.Profile.Dimensions,
	}}
	worker := newTestEmbeddingV2Worker(t, repository, embedder)
	err := worker.Run(context.Background())
	require.Error(t, err)
	assert.ErrorIs(t, err, expected)
	assert.Contains(t, err.Error(), "claim embedding v2 job")
}
