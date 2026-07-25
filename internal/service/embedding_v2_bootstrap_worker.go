package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/xxxsen/common/logutil"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/ai"
	"github.com/xxxsen/mnote/internal/model"
)

var (
	errEmbeddingV2BootstrapDependencies = errors.New(
		"embedding v2 bootstrap dependencies are required",
	)
	errEmbeddingV2BootstrapConfig = errors.New(
		"embedding v2 bootstrap config is invalid",
	)
	errEmbeddingV2BootstrapStatus = errors.New(
		"initial embedding generation has invalid status",
	)
	errEmbeddingV2BootstrapProfile = errors.New(
		"initial embedding profile is not configured",
	)
	errEmbeddingV2PreflightDimensions = errors.New(
		"embedding profile preflight returned invalid dimensions",
	)
)

type embeddingV2BootstrapRepo interface {
	GenerationStats(
		context.Context,
		string,
		int64,
	) (*model.EmbeddingGenerationStats, error)
	ValidateGenerationVectors(context.Context, string, int) error
	ActivateGeneration(context.Context, string, int64, int64) error
}

type EmbeddingV2BootstrapWorkerConfig struct {
	GenerationID  string
	Standby       time.Duration
	PollInterval  time.Duration
	RetryInterval time.Duration
}

type EmbeddingV2BootstrapWorker struct {
	repo      embeddingV2BootstrapRepo
	embedders map[string]ai.ProfileEmbedder
	config    EmbeddingV2BootstrapWorkerConfig
	now       func() time.Time
}

func NewEmbeddingV2BootstrapWorker(
	repository embeddingV2BootstrapRepo,
	embedders map[string]ai.ProfileEmbedder,
	config EmbeddingV2BootstrapWorkerConfig,
) (*EmbeddingV2BootstrapWorker, error) {
	if repository == nil || len(embedders) == 0 {
		return nil, errEmbeddingV2BootstrapDependencies
	}
	if config.GenerationID == "" ||
		config.Standby <= 0 ||
		config.PollInterval <= 0 ||
		config.RetryInterval <= 0 {
		return nil, errEmbeddingV2BootstrapConfig
	}
	return &EmbeddingV2BootstrapWorker{
		repo:      repository,
		embedders: embedders,
		config:    config,
		now:       time.Now,
	}, nil
}

func (worker *EmbeddingV2BootstrapWorker) Run(ctx context.Context) error {
	for {
		retryAfter, done, err := worker.activateIfReady(ctx)
		if err != nil {
			return err
		}
		if done {
			return nil
		}
		if err := waitEmbeddingV2Bootstrap(ctx, retryAfter); err != nil {
			return err
		}
	}
}

func (worker *EmbeddingV2BootstrapWorker) activateIfReady(
	ctx context.Context,
) (time.Duration, bool, error) {
	now := worker.now()
	stats, err := worker.repo.GenerationStats(
		ctx,
		worker.config.GenerationID,
		now.Unix(),
	)
	if err != nil {
		return 0, false, fmt.Errorf("read initial embedding generation: %w", err)
	}
	switch stats.Generation.Status {
	case model.EmbeddingGenerationActive:
		return 0, true, nil
	case model.EmbeddingGenerationBuilding:
	case model.EmbeddingGenerationStandby,
		model.EmbeddingGenerationRetired,
		model.EmbeddingGenerationFailed:
		return 0, true, nil
	default:
		return 0, false, fmt.Errorf(
			"%w: %q",
			errEmbeddingV2BootstrapStatus,
			stats.Generation.Status,
		)
	}
	if !stats.CanActivate {
		return worker.config.PollInterval, false, nil
	}
	embedder := worker.embedders[stats.Profile.ID]
	if embedder == nil ||
		embedder.Profile().Fingerprint != stats.Profile.Fingerprint {
		return 0, false, fmt.Errorf(
			"%w: %q",
			errEmbeddingV2BootstrapProfile,
			stats.Profile.ID,
		)
	}
	if err := preflightEmbeddingV2Profile(ctx, stats.Profile, embedder); err != nil {
		worker.logActivationRetry(ctx, "provider preflight failed", err)
		return worker.config.RetryInterval, false, nil
	}
	if err := worker.repo.ValidateGenerationVectors(
		ctx,
		worker.config.GenerationID,
		100,
	); err != nil {
		worker.logActivationRetry(ctx, "vector validation failed", err)
		return worker.config.RetryInterval, false, nil
	}
	if err := worker.repo.ActivateGeneration(
		ctx,
		worker.config.GenerationID,
		now.Unix(),
		int64(worker.config.Standby/time.Second),
	); err != nil {
		worker.logActivationRetry(ctx, "atomic activation failed", err)
		return worker.config.RetryInterval, false, nil
	}
	logutil.GetLogger(ctx).Info(
		"initial embedding v2 generation activated",
		zap.String("generation", worker.config.GenerationID),
		zap.String("profile", stats.Profile.ID),
	)
	return 0, true, nil
}

func (worker *EmbeddingV2BootstrapWorker) logActivationRetry(
	ctx context.Context,
	message string,
	err error,
) {
	logutil.GetLogger(ctx).Warn(
		"initial embedding v2 activation deferred",
		zap.String("generation", worker.config.GenerationID),
		zap.String("reason", message),
		zap.Error(err),
	)
}

func preflightEmbeddingV2Profile(
	ctx context.Context,
	profile model.EmbeddingProfile,
	embedder ai.ProfileEmbedder,
) error {
	checks := []ai.EmbeddingRequest{
		{
			Inputs:   []string{"mnote embedding query health check"},
			TaskType: profile.QueryTaskType,
		},
		{
			Inputs:   []string{"mnote embedding document health check"},
			TaskType: profile.DocumentTaskType,
		},
	}
	for _, request := range checks {
		result, err := embedder.EmbedBatch(ctx, request)
		if err != nil {
			return fmt.Errorf("embedding profile preflight: %w", err)
		}
		if len(result.Vectors) != 1 ||
			len(result.Vectors[0]) != profile.Dimensions {
			return errEmbeddingV2PreflightDimensions
		}
	}
	return nil
}

func waitEmbeddingV2Bootstrap(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return fmt.Errorf("embedding v2 bootstrap stopped: %w", ctx.Err())
	case <-timer.C:
		return nil
	}
}
