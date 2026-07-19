package job

import (
	"context"
	"fmt"
	"time"
)

type ImportCleanupJob struct {
	jobRepo expiryCleaner
	maxAge  time.Duration
}

func NewImportCleanupJob(
	jobRepo expiryCleaner,
	noteRepo expiryCleaner,
	maxAge time.Duration,
) *ImportCleanupJob {
	_ = noteRepo // Notes are deleted atomically by the database cascade.
	return &ImportCleanupJob{jobRepo: jobRepo, maxAge: maxAge}
}

func (j *ImportCleanupJob) Name() string {
	return "import_cleanup"
}

func (j *ImportCleanupJob) Run(ctx context.Context) error {
	if j.jobRepo == nil {
		return nil
	}
	maxAge := j.maxAge
	if maxAge <= 0 {
		maxAge = 24 * time.Hour
	}
	cutoff := time.Now().Add(-maxAge).Unix()
	for {
		if err := ctx.Err(); err != nil {
			return fmt.Errorf("cleanup canceled: %w", err)
		}
		deleted, err := j.jobRepo.DeleteBefore(ctx, cutoff)
		if err != nil {
			return fmt.Errorf("delete expired jobs: %w", err)
		}
		if deleted < 500 {
			return nil
		}
	}
}
