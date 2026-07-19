package service

import (
	"context"
	"errors"
	"fmt"
	"time"
	"unicode/utf8"

	"github.com/xxxsen/common/logutil"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/safeconv"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
)

type DocumentSummary struct {
	Recent       []model.Document
	TagCounts    map[string]int
	Total        int
	StarredTotal int
}

// UpdateSummary only writes the document_summaries row. We deliberately
// do not touch document.mtime/content_mtime so summary regeneration does
// not invalidate the embedding state.
func (s *DocumentService) UpdateSummary(ctx context.Context, userID, docID, summary string) error {
	return s.runInTx(ctx, func(txCtx context.Context) error {
		document, err := s.docs.GetByIDForUpdate(txCtx, userID, docID)
		if err != nil {
			return fmt.Errorf("lock document: %w", err)
		}
		if stateRepo, ok := s.summaries.(summaryStateRepo); ok {
			if err := stateRepo.UpsertSucceeded(
				txCtx, userID, docID, summary, document.ContentHash,
				s.runtime.Clock.Now().Unix(),
			); err != nil {
				return fmt.Errorf("upsert succeeded summary: %w", err)
			}
			return nil
		}
		if err := s.summaries.Upsert(
			txCtx, userID, docID, summary, timeutil.NowUnix(),
		); err != nil {
			return fmt.Errorf("upsert: %w", err)
		}
		return nil
	})
}

func (s *DocumentService) Summary(ctx context.Context, userID string, recentLimit uint) (*DocumentSummary, error) {
	page := Page{Limit: safeconv.UintToInt(recentLimit)}.Clamp(5, 20)
	recentLimit = safeconv.IntToUint(page.Limit)
	recent, err := s.docs.List(ctx, userID, nil, recentLimit, 0, "mtime desc")
	if err != nil {
		return nil, fmt.Errorf("list: %w", err)
	}
	recent, err = s.attachSummaries(ctx, userID, recent)
	if err != nil {
		return nil, fmt.Errorf("attach summaries: %w", err)
	}
	items, err := s.tags.ListByUser(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list by user: %w", err)
	}
	counts := make(map[string]int)
	for _, item := range items {
		counts[item.TagID]++
	}
	count, err := s.docs.Count(ctx, userID, nil)
	if err != nil {
		return nil, fmt.Errorf("count total: %w", err)
	}
	starredVal := 1
	starredCount, err := s.docs.Count(ctx, userID, &starredVal)
	if err != nil {
		return nil, fmt.Errorf("count starred: %w", err)
	}
	return &DocumentSummary{Recent: recent, TagCounts: counts, Total: count, StarredTotal: starredCount}, nil
}

func (s *DocumentService) persistSummaryState(
	ctx context.Context, userID, docID string,
	summary *string, contentHash string, now int64,
) error {
	stateRepo, hasState := s.summaries.(summaryStateRepo)
	if summary == nil {
		if !hasState {
			return nil
		}
		if err := stateRepo.MarkPending(ctx, userID, docID, contentHash, now); err != nil {
			return fmt.Errorf("mark summary pending: %w", err)
		}
		return nil
	}
	if hasState {
		if err := stateRepo.UpsertSucceeded(
			ctx, userID, docID, *summary, contentHash, now,
		); err != nil {
			return fmt.Errorf("upsert succeeded summary: %w", err)
		}
		return nil
	}
	if err := s.summaries.Upsert(ctx, userID, docID, *summary, now); err != nil {
		return fmt.Errorf("upsert summary: %w", err)
	}
	return nil
}

func (s *DocumentService) ProcessPendingSummaries(ctx context.Context, delaySeconds int64) error {
	if s.ai == nil || s.summaries == nil {
		return nil
	}
	if stateRepo, ok := s.summaries.(summaryStateRepo); ok {
		return s.processSummaryStateQueue(ctx, stateRepo, delaySeconds)
	}
	logger := logutil.GetLogger(ctx)
	cutoff := timeutil.NowUnix() - clampDelay(delaySeconds)
	docs, err := s.summaries.ListPendingDocuments(ctx, 50, cutoff)
	if err != nil {
		logger.Error("failed to list pending summaries", zap.Error(err))
		return fmt.Errorf("list pending documents: %w", err)
	}
	if len(docs) == 0 {
		return nil
	}
	logger.Info("processing pending summaries", zap.Int("count", len(docs)))
	for _, doc := range docs {
		if err := checkCtx(ctx); err != nil {
			return err
		}
		if err := s.processOneSummary(ctx, logger, doc); err != nil {
			return err
		}
	}
	return nil
}

func (s *DocumentService) processSummaryStateQueue(
	ctx context.Context, summaries summaryStateRepo, delaySeconds int64,
) error {
	logger := logutil.GetLogger(ctx)
	for range 50 {
		if err := checkCtx(ctx); err != nil {
			return err
		}
		now := s.runtime.Clock.Now()
		task, err := summaries.Claim(
			ctx,
			now.Unix(),
			now.Unix()-clampDelay(delaySeconds),
			now.Add(2*time.Minute).Unix(),
		)
		if errors.Is(err, appErr.ErrNoWork) {
			return nil
		}
		if err != nil {
			return fmt.Errorf("claim pending summary: %w", err)
		}
		if task == nil {
			return nil
		}
		if err := s.processClaimedSummary(
			ctx, summaries, task, now, logger,
		); err != nil {
			return err
		}
	}
	return nil
}

func (s *DocumentService) processClaimedSummary(
	ctx context.Context, summaries summaryStateRepo,
	task *model.SummaryTask, claimedAt time.Time, logger *zap.Logger,
) error {
	summary := ""
	var err error
	if utf8.RuneCountInString(task.Content) >= minSummaryChars {
		summary, err = s.ai.Summarize(ctx, task.Content)
	}
	if err != nil {
		stableError := "ai dependency failure"
		if isRateLimitErr(err) {
			stableError = "ai rate limited"
		}
		backoff := time.Duration(1<<min(task.Attempts-1, 4)) * time.Minute
		if markErr := summaries.MarkFailed(
			ctx, task.DocumentID, stableError,
			claimedAt.Add(backoff).Unix(), claimedAt.Unix(),
		); markErr != nil {
			return fmt.Errorf("mark summary failed: %w", markErr)
		}
		logger.Warn(
			"summary generation failed",
			zap.String("doc_id", task.DocumentID),
			zap.Int("attempts", task.Attempts),
		)
		return nil
	}
	applied, err := summaries.CompleteIfCurrent(
		ctx, task, summary, s.runtime.Clock.Now().Unix(),
	)
	if err != nil {
		return fmt.Errorf("complete summary: %w", err)
	}
	if !applied {
		logger.Debug(
			"stale summary discarded",
			zap.String("doc_id", task.DocumentID),
		)
	}
	return nil
}

func (s *DocumentService) processOneSummary(
	ctx context.Context, logger *zap.Logger, doc model.Document,
) error {
	if utf8.RuneCountInString(doc.Content) < minSummaryChars {
		now := timeutil.NowUnix()
		if err := s.summaries.Upsert(ctx, doc.UserID, doc.ID, "", now); err != nil {
			logger.Error("failed to mark empty summary", zap.String("doc_id", doc.ID), zap.Error(err))
		}
		return nil
	}
	summary, err := s.ai.Summarize(ctx, doc.Content)
	if err != nil {
		return s.handleSummaryError(ctx, logger, doc.ID, err)
	}
	now := timeutil.NowUnix()
	if err := s.summaries.Upsert(ctx, doc.UserID, doc.ID, summary, now); err != nil {
		logger.Error("failed to save summary", zap.String("doc_id", doc.ID), zap.Error(err))
	}
	return waitCtx(ctx, 100*time.Millisecond)
}

func (s *DocumentService) handleSummaryError(
	ctx context.Context, logger *zap.Logger, docID string, err error,
) error {
	if isRateLimitErr(err) {
		logger.Warn("ai rate limit triggered, cooling down...", zap.Error(err))
		return waitCtx(ctx, 10*time.Second)
	}
	logger.Error("failed to summarize document", zap.String("doc_id", docID), zap.Error(err))
	return nil
}

func (s *DocumentService) attachSummary(ctx context.Context, userID string, doc *model.Document) error {
	if doc == nil {
		return nil
	}
	summary, err := s.summaries.GetByDocID(ctx, userID, doc.ID)
	if err == nil {
		doc.Summary = summary
		return nil
	}
	if errors.Is(err, appErr.ErrNotFound) {
		doc.Summary = ""
		return nil
	}
	return fmt.Errorf("get summary: %w", err)
}

func (
	s *DocumentService) attachSummaries(ctx context.Context,
	userID string,
	docs []model.Document) ([]model.Document,
	error,
) {
	if err := populateDocSummaries(ctx, s.summaries, userID, docs); err != nil {
		return nil, err
	}
	return docs, nil
}
