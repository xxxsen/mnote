package service

import (
	"context"
	"errors"
	"fmt"
	"hash/fnv"
	"time"

	"golang.org/x/sync/errgroup"

	"github.com/xxxsen/mnote/internal/ai"
	"github.com/xxxsen/mnote/internal/metrics"
	"github.com/xxxsen/mnote/internal/model"
)

var (
	errEmbeddingV2WorkerDependencies = errors.New(
		"embedding v2 worker dependencies are required",
	)
	errEmbeddingV2WorkerConfig = errors.New("embedding v2 worker config is invalid")
)

type embeddingV2WorkerRepo interface {
	ClaimJobs(
		ctx context.Context,
		generationStatus model.EmbeddingGenerationStatus,
		limit int,
		now, leaseUntil int64,
	) ([]model.EmbeddingJobClaim, error)
	RenewClaim(
		ctx context.Context,
		generationID, documentID, claimToken string,
		leaseUntil, now int64,
	) (bool, error)
	CompleteClaim(
		ctx context.Context,
		claim model.EmbeddingJobClaim,
		chunks []model.ChunkEmbeddingV2,
		centroid []float32,
		now int64,
	) (bool, error)
	MarkClaimFailed(
		ctx context.Context,
		generationID, documentID, claimToken string,
		code, message string,
		retryAt, now int64,
		maxAttempts int,
		permanent bool,
	) (bool, error)
}

type EmbeddingV2WorkerConfig struct {
	Concurrency   int
	BatchSize     int
	Lease         time.Duration
	RenewInterval time.Duration
	MaxAttempts   int
	PollInterval  time.Duration
}

type EmbeddingV2Worker struct {
	repo      embeddingV2WorkerRepo
	embedders map[string]ai.ProfileEmbedder
	chunker   *ai.ChunkerV2
	config    EmbeddingV2WorkerConfig
	now       func() time.Time
}

func NewEmbeddingV2Worker(
	repository embeddingV2WorkerRepo,
	embedders map[string]ai.ProfileEmbedder,
	config EmbeddingV2WorkerConfig,
) (*EmbeddingV2Worker, error) {
	if repository == nil || len(embedders) == 0 {
		return nil, errEmbeddingV2WorkerDependencies
	}
	if config.Concurrency <= 0 || config.BatchSize <= 0 ||
		config.Lease <= 0 || config.RenewInterval <= 0 ||
		config.MaxAttempts <= 0 || config.PollInterval <= 0 ||
		config.RenewInterval >= config.Lease {
		return nil, errEmbeddingV2WorkerConfig
	}
	return &EmbeddingV2Worker{
		repo:      repository,
		embedders: embedders,
		chunker:   ai.NewChunkerV2(),
		config:    config,
		now:       time.Now,
	}, nil
}

func (worker *EmbeddingV2Worker) Run(ctx context.Context) error {
	group, groupCtx := errgroup.WithContext(ctx)
	for slot := 0; slot < worker.config.Concurrency; slot++ {
		group.Go(func() error {
			return worker.runSlot(groupCtx, slot)
		})
	}
	if err := group.Wait(); err != nil {
		return fmt.Errorf("run embedding v2 workers: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return fmt.Errorf("embedding v2 worker context: %w", err)
	}
	return nil
}

func (worker *EmbeddingV2Worker) runSlot(ctx context.Context, slot int) error {
	cursor := 0
	for {
		if err := ctx.Err(); err != nil {
			return fmt.Errorf("embedding v2 slot context: %w", err)
		}
		statuses := worker.slotStatuses(slot)
		claimed := false
		for attempt := 0; attempt < len(statuses); attempt++ {
			status := statuses[(cursor+attempt)%len(statuses)]
			now := worker.now()
			claims, err := worker.repo.ClaimJobs(
				ctx,
				status,
				1,
				now.Unix(),
				now.Add(worker.config.Lease).Unix(),
			)
			if err != nil {
				return fmt.Errorf("claim embedding v2 job: %w", err)
			}
			if len(claims) == 0 {
				continue
			}
			cursor = (cursor + attempt + 1) % len(statuses)
			if err := worker.processClaim(ctx, claims[0]); err != nil {
				return err
			}
			claimed = true
			break
		}
		if claimed {
			continue
		}
		timer := time.NewTimer(worker.config.PollInterval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return fmt.Errorf("embedding v2 slot stopped: %w", ctx.Err())
		case <-timer.C:
		}
	}
}

func (worker *EmbeddingV2Worker) slotStatuses(
	slot int,
) []model.EmbeddingGenerationStatus {
	if worker.config.Concurrency == 1 {
		return []model.EmbeddingGenerationStatus{
			model.EmbeddingGenerationActive,
			model.EmbeddingGenerationBuilding,
			model.EmbeddingGenerationActive,
			model.EmbeddingGenerationStandby,
		}
	}
	if slot == 0 {
		return []model.EmbeddingGenerationStatus{
			model.EmbeddingGenerationBuilding,
			model.EmbeddingGenerationActive,
			model.EmbeddingGenerationStandby,
		}
	}
	return []model.EmbeddingGenerationStatus{
		model.EmbeddingGenerationActive,
		model.EmbeddingGenerationStandby,
		model.EmbeddingGenerationBuilding,
	}
}

func (worker *EmbeddingV2Worker) processClaim(
	parent context.Context,
	claim model.EmbeddingJobClaim,
) error {
	startedAt := worker.now()
	defer func() {
		metrics.ObserveEmbeddingJob(
			claim.Profile.ID,
			worker.now().Sub(startedAt),
		)
	}()
	embedder := worker.embedders[claim.Profile.ID]
	if embedder == nil ||
		embedder.Profile().Fingerprint != claim.Profile.Fingerprint {
		return worker.failClaim(
			parent,
			claim,
			&ai.ProviderError{
				Code:    ai.ErrorInvalidConfig,
				Message: "configured profile does not match claimed generation",
			},
		)
	}
	claimCtx, cancelClaim := context.WithCancel(parent)
	defer cancelClaim()
	renewErrors := make(chan error, 1)
	go worker.renewClaim(claimCtx, cancelClaim, claim, renewErrors)

	chunks, err := worker.chunker.Chunk(claimCtx, claim.Title, claim.Content)
	if err == nil {
		err = worker.embedChunks(claimCtx, embedder, claim.Profile, chunks)
	}
	if err == nil {
		var centroid []float32
		centroid, err = ai.ComputeCentroid(chunks, claim.Profile.Dimensions)
		if err == nil {
			now := worker.now().Unix()
			var applied bool
			applied, err = worker.repo.CompleteClaim(
				claimCtx,
				claim,
				chunks,
				centroid,
				now,
			)
			if err == nil && !applied {
				cancelClaim()
				return nil
			}
		}
	}
	cancelClaim()
	renewErr := <-renewErrors
	if renewErr != nil {
		return renewErr
	}
	if err == nil {
		return nil
	}
	if parent.Err() != nil {
		return fmt.Errorf("embedding v2 claim context: %w", parent.Err())
	}
	code, _, classified := ai.ErrorDetails(err)
	if classified && code == ai.ErrorCanceled {
		return nil
	}
	return worker.failClaim(parent, claim, err)
}

func (worker *EmbeddingV2Worker) renewClaim(
	ctx context.Context,
	cancel context.CancelFunc,
	claim model.EmbeddingJobClaim,
	result chan<- error,
) {
	defer close(result)
	timer := time.NewTicker(worker.config.RenewInterval)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
			now := worker.now()
			renewed, err := worker.repo.RenewClaim(
				ctx,
				claim.GenerationID,
				claim.DocumentID,
				claim.ClaimToken,
				now.Add(worker.config.Lease).Unix(),
				now.Unix(),
			)
			if err != nil {
				if ctx.Err() != nil {
					return
				}
				select {
				case result <- fmt.Errorf("renew embedding v2 claim: %w", err):
				default:
				}
				cancel()
				return
			}
			if !renewed {
				cancel()
				return
			}
		}
	}
}

func (worker *EmbeddingV2Worker) embedChunks(
	ctx context.Context,
	embedder ai.ProfileEmbedder,
	profile model.EmbeddingProfile,
	chunks []model.ChunkEmbeddingV2,
) error {
	for start := 0; start < len(chunks); start += worker.config.BatchSize {
		end := start + worker.config.BatchSize
		if end > len(chunks) {
			end = len(chunks)
		}
		inputs := make([]string, 0, end-start)
		for index := start; index < end; index++ {
			inputs = append(inputs, chunks[index].Content)
		}
		result, err := embedder.EmbedBatch(ctx, ai.EmbeddingRequest{
			Inputs:   inputs,
			TaskType: profile.DocumentTaskType,
		})
		if err != nil {
			return fmt.Errorf("embed chunk batch: %w", err)
		}
		if len(result.Vectors) != len(inputs) {
			return &ai.ProviderError{
				Code:    ai.ErrorInvalidResponse,
				Message: "batch result count changed after validation",
			}
		}
		for offset, vector := range result.Vectors {
			chunks[start+offset].Dimensions = profile.Dimensions
			chunks[start+offset].Embedding = vector
		}
	}
	return nil
}

func (worker *EmbeddingV2Worker) failClaim(
	ctx context.Context,
	claim model.EmbeddingJobClaim,
	processErr error,
) error {
	code, retryAfter, classified := ai.ErrorDetails(processErr)
	if !classified {
		code = ai.ErrorTransport
	}
	permanent := ai.IsPermanentProviderError(processErr)
	now := worker.now()
	if retryAfter <= 0 {
		retryAfter = embeddingV2Backoff(claim.Attempts, claim.ClaimToken)
	}
	applied, err := worker.repo.MarkClaimFailed(
		ctx,
		claim.GenerationID,
		claim.DocumentID,
		claim.ClaimToken,
		string(code),
		stableEmbeddingError(processErr),
		now.Add(retryAfter).Unix(),
		now.Unix(),
		worker.config.MaxAttempts,
		permanent,
	)
	if err != nil {
		return fmt.Errorf("record embedding v2 failure: %w", err)
	}
	if !applied {
		return nil
	}
	return nil
}

func stableEmbeddingError(err error) string {
	code, _, ok := ai.ErrorDetails(err)
	if !ok {
		return "embedding provider dependency failed"
	}
	switch code {
	case ai.ErrorInvalidConfig:
		return "embedding provider configuration is invalid"
	case ai.ErrorInvalidRequest:
		return "embedding request was rejected"
	case ai.ErrorUnauthorized:
		return "embedding provider authorization failed"
	case ai.ErrorRateLimited:
		return "embedding provider rate limited the request"
	case ai.ErrorTimeout:
		return "embedding provider request timed out"
	case ai.ErrorTransport:
		return "embedding provider transport failed"
	case ai.ErrorUpstream5xx:
		return "embedding provider is unavailable"
	case ai.ErrorInvalidResponse:
		return "embedding provider returned an invalid response"
	case ai.ErrorCanceled:
		return "embedding request was canceled"
	default:
		return "embedding provider dependency failed"
	}
}

func embeddingV2Backoff(attempts int, token string) time.Duration {
	if attempts < 1 {
		attempts = 1
	}
	seconds := int64(60)
	for index := 1; index < attempts && seconds < 3600; index++ {
		seconds *= 2
		if seconds > 3600 {
			seconds = 3600
		}
	}
	hasher := fnv.New32a()
	_, _ = hasher.Write([]byte(token))
	jitterPercent := hasher.Sum32() % 21
	return time.Duration(
		seconds+seconds*int64(jitterPercent)/100,
	) * time.Second
}
