package job

import (
	"context"
	"fmt"
)

type embeddingProcessor interface {
	ProcessPendingEmbeddings(ctx context.Context, delaySeconds int64) error
}

// AIEmbeddingJob syncs document embeddings for newly modified documents.
type AIEmbeddingJob struct {
	embedding    embeddingProcessor
	delaySeconds int64
}

func NewAIEmbeddingJob(embedding embeddingProcessor, delaySeconds int64) *AIEmbeddingJob {
	return &AIEmbeddingJob{embedding: embedding, delaySeconds: delaySeconds}
}

func (j *AIEmbeddingJob) Name() string { return "ai_embedding" }

func (j *AIEmbeddingJob) Run(ctx context.Context) error {
	if j.embedding == nil {
		return nil
	}
	if err := j.embedding.ProcessPendingEmbeddings(ctx, j.delaySeconds); err != nil {
		return fmt.Errorf("process pending embeddings: %w", err)
	}
	return nil
}
