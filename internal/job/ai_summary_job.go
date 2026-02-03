package job

import (
	"context"

	"github.com/xxxsen/mnote/internal/service"
)

type AISummaryJob struct {
	documents    *service.DocumentService
	delaySeconds int64
}

func NewAISummaryJob(documents *service.DocumentService, delaySeconds int64) *AISummaryJob {
	return &AISummaryJob{documents: documents, delaySeconds: delaySeconds}
}

func (j *AISummaryJob) Name() string {
	return "ai_summary"
}

func (j *AISummaryJob) Run(ctx context.Context) error {
	if j.documents == nil {
		return nil
	}
	return j.documents.ProcessPendingSummaries(ctx, j.delaySeconds)
}
