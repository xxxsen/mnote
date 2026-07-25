package job

import (
	"context"
	"fmt"
	"time"

	"github.com/xxxsen/mnote/internal/metrics"
	"github.com/xxxsen/mnote/internal/model"
)

type embeddingV2MaintenanceRepo interface {
	RetireExpiredStandbys(ctx context.Context, now int64) (int64, error)
	CleanupRetiredGenerationBatch(
		ctx context.Context,
		cutoff int64,
		limit int,
	) (int64, error)
	ListGenerations(ctx context.Context) ([]model.EmbeddingGeneration, error)
	GenerationStats(
		ctx context.Context,
		generationID string,
		now int64,
	) (*model.EmbeddingGenerationStats, error)
	ListCooldowns(
		ctx context.Context,
		profileID string,
	) ([]model.EmbeddingProviderCooldown, error)
}

type embeddingV2CacheMaintenanceRepo interface {
	DeleteBeforeBatch(ctx context.Context, cutoff int64, limit int) (int64, error)
}

type EmbeddingV2MaintenanceJob struct {
	embeddings embeddingV2MaintenanceRepo
	cache      embeddingV2CacheMaintenanceRepo
}

func NewEmbeddingV2MaintenanceJob(
	embeddings embeddingV2MaintenanceRepo,
	cache embeddingV2CacheMaintenanceRepo,
) *EmbeddingV2MaintenanceJob {
	return &EmbeddingV2MaintenanceJob{embeddings: embeddings, cache: cache}
}

func (*EmbeddingV2MaintenanceJob) Name() string {
	return "embedding_v2_maintenance"
}

func (job *EmbeddingV2MaintenanceJob) Run(ctx context.Context) error {
	if job.embeddings == nil || job.cache == nil {
		return nil
	}
	now := time.Now()
	if _, err := job.embeddings.RetireExpiredStandbys(ctx, now.Unix()); err != nil {
		return fmt.Errorf("retire expired embedding standby: %w", err)
	}
	for range 100 {
		deleted, err := job.embeddings.CleanupRetiredGenerationBatch(
			ctx,
			now.Add(-7*24*time.Hour).Unix(),
			500,
		)
		if err != nil {
			return fmt.Errorf("clean retired embedding generation: %w", err)
		}
		if deleted == 0 {
			break
		}
	}
	for range 100 {
		deleted, err := job.cache.DeleteBeforeBatch(
			ctx,
			now.Add(-30*24*time.Hour).Unix(),
			1000,
		)
		if err != nil {
			return fmt.Errorf("clean embedding cache v2: %w", err)
		}
		if deleted == 0 {
			break
		}
	}
	return job.refreshMetrics(ctx, now)
}

func (job *EmbeddingV2MaintenanceJob) refreshMetrics(
	ctx context.Context,
	now time.Time,
) error {
	generations, err := job.embeddings.ListGenerations(ctx)
	if err != nil {
		return fmt.Errorf("list embedding metrics generations: %w", err)
	}
	statsByGeneration := make([]*model.EmbeddingGenerationStats, 0, len(generations))
	for _, generation := range generations {
		if !liveEmbeddingGeneration(generation.Status) {
			continue
		}
		stats, err := job.embeddings.GenerationStats(
			ctx,
			generation.ID,
			now.Unix(),
		)
		if err != nil {
			return fmt.Errorf("read embedding metrics generation: %w", err)
		}
		statsByGeneration = append(statsByGeneration, stats)
	}
	cooldowns, err := job.embeddings.ListCooldowns(ctx, "")
	if err != nil {
		return fmt.Errorf("read embedding cooldown metrics: %w", err)
	}
	publishEmbeddingMaintenanceMetrics(statsByGeneration, cooldowns, now.Unix())
	return nil
}

func liveEmbeddingGeneration(status model.EmbeddingGenerationStatus) bool {
	return status == model.EmbeddingGenerationActive ||
		status == model.EmbeddingGenerationBuilding ||
		status == model.EmbeddingGenerationStandby
}

func publishEmbeddingMaintenanceMetrics(
	statsByGeneration []*model.EmbeddingGenerationStats,
	cooldowns []model.EmbeddingProviderCooldown,
	now int64,
) {
	metrics.ResetEmbeddingMaintenanceGauges()
	publishEmbeddingGenerationMetrics(statsByGeneration, now)
	publishEmbeddingCooldownMetrics(cooldowns, now)
}

func publishEmbeddingGenerationMetrics(
	statsByGeneration []*model.EmbeddingGenerationStats,
	now int64,
) {
	jobsByProfile := make(map[string]map[string]int64)
	oldestByProfile := make(map[string]float64)
	for _, stats := range statsByGeneration {
		for status, value := range map[string]int64{
			"pending":   stats.Pending,
			"running":   stats.Running,
			"failed":    stats.Failed,
			"dead":      stats.Dead,
			"succeeded": stats.Succeeded,
		} {
			if jobsByProfile[stats.Profile.ID] == nil {
				jobsByProfile[stats.Profile.ID] = make(map[string]int64)
			}
			jobsByProfile[stats.Profile.ID][status] += value
		}
		oldest := float64(0)
		if stats.OldestReadyAt > 0 && stats.OldestReadyAt < now {
			oldest = float64(now - stats.OldestReadyAt)
		}
		if oldest > oldestByProfile[stats.Profile.ID] {
			oldestByProfile[stats.Profile.ID] = oldest
		}
		coverage := float64(1)
		if stats.NormalDocuments > 0 {
			coverage = float64(stats.Current) / float64(stats.NormalDocuments)
		}
		metrics.SetEmbeddingCoverage(stats.Generation.ID, coverage)
	}
	for profileID, statuses := range jobsByProfile {
		for status, value := range statuses {
			metrics.SetEmbeddingJobs(profileID, status, float64(value))
		}
		metrics.SetEmbeddingOldestReady(profileID, oldestByProfile[profileID])
	}
}

func publishEmbeddingCooldownMetrics(
	cooldowns []model.EmbeddingProviderCooldown,
	now int64,
) {
	cooldownByProvider := make(map[string]float64)
	for _, cooldown := range cooldowns {
		seconds := float64(0)
		if cooldown.BlockedUntil > now {
			seconds = float64(cooldown.BlockedUntil - now)
		}
		current, exists := cooldownByProvider[cooldown.ProviderName]
		if !exists || seconds > current {
			cooldownByProvider[cooldown.ProviderName] = seconds
		}
	}
	for providerName, seconds := range cooldownByProvider {
		metrics.SetEmbeddingProviderCooldown(providerName, seconds)
	}
}
