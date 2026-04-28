package job

import (
	"context"
	"fmt"
)

type embeddingProcessor interface {
	ProcessPendingEmbeddings(ctx context.Context, delaySeconds int64) error
}

type summaryProcessor interface {
	ProcessPendingSummaries(ctx context.Context, delaySeconds int64) error
}

// AIEmbeddingJob syncs document embeddings for newly modified documents.
type AIEmbeddingJob struct {
	ai           embeddingProcessor
	delaySeconds int64
}

func NewAIEmbeddingJob(ai embeddingProcessor, delaySeconds int64) *AIEmbeddingJob {
	return &AIEmbeddingJob{ai: ai, delaySeconds: delaySeconds}
}

func (j *AIEmbeddingJob) Name() string { return "ai_embedding" }

func (j *AIEmbeddingJob) Run(ctx context.Context) error {
	if j.ai == nil {
		return nil
	}
	if err := j.ai.ProcessPendingEmbeddings(ctx, j.delaySeconds); err != nil {
		return fmt.Errorf("process pending embeddings: %w", err)
	}
	return nil
}

// AISummaryJob generates AI summaries for documents that lack them.
type AISummaryJob struct {
	documents    summaryProcessor
	delaySeconds int64
}

func NewAISummaryJob(
	documents summaryProcessor, delaySeconds int64,
) *AISummaryJob {
	return &AISummaryJob{documents: documents, delaySeconds: delaySeconds}
}

func (j *AISummaryJob) Name() string { return "ai_summary" }

func (j *AISummaryJob) Run(ctx context.Context) error {
	if j.documents == nil {
		return nil
	}
	if err := j.documents.ProcessPendingSummaries(ctx, j.delaySeconds); err != nil {
		return fmt.Errorf("process pending summaries: %w", err)
	}
	return nil
}
