package job

import (
	"context"

	"github.com/xxxsen/mnote/internal/service"
)

type AIEmbeddingJob struct {
	ai           *service.AIService
	delaySeconds int64
}

func NewAIEmbeddingJob(ai *service.AIService, delaySeconds int64) *AIEmbeddingJob {
	return &AIEmbeddingJob{ai: ai, delaySeconds: delaySeconds}
}

func (j *AIEmbeddingJob) Name() string {
	return "ai_embedding"
}

func (j *AIEmbeddingJob) Run(ctx context.Context) error {
	if j.ai == nil {
		return nil
	}
	return j.ai.ProcessPendingEmbeddings(ctx, j.delaySeconds)
}
