package job

import (
	"context"
	"time"

	"github.com/xxxsen/mnote/internal/repo"
)

type ImportCleanupJob struct {
	jobRepo  *repo.ImportJobRepo
	noteRepo *repo.ImportJobNoteRepo
	maxAge   time.Duration
}

func NewImportCleanupJob(jobRepo *repo.ImportJobRepo, noteRepo *repo.ImportJobNoteRepo, maxAge time.Duration) *ImportCleanupJob {
	return &ImportCleanupJob{jobRepo: jobRepo, noteRepo: noteRepo, maxAge: maxAge}
}

func (j *ImportCleanupJob) Name() string {
	return "import_cleanup"
}

func (j *ImportCleanupJob) Run(ctx context.Context) error {
	if j.jobRepo == nil || j.noteRepo == nil {
		return nil
	}
	maxAge := j.maxAge
	if maxAge <= 0 {
		maxAge = 24 * time.Hour
	}
	cutoff := time.Now().Add(-maxAge).Unix()
	_, err := j.noteRepo.DeleteBefore(ctx, cutoff)
	if err != nil {
		return err
	}
	_, err = j.jobRepo.DeleteBefore(ctx, cutoff)
	return err
}
