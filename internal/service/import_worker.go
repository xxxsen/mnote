package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/xxxsen/common/logutil"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

const importLeaseDuration = 2 * time.Minute

type importWorkerJobRepo interface {
	Claim(ctx context.Context, now, lockedUntil int64) (*model.ImportJob, error)
	Finish(
		ctx context.Context, jobID string, report *model.ImportReport,
		processed, total int, now int64,
	) error
	ReleaseAfterFailure(
		ctx context.Context, jobID, stableError string, nextRetryAt, now int64,
	) error
}

type importWorkerNoteRepo interface {
	NextPending(ctx context.Context, userID, jobID string) (*model.ImportJobNote, error)
	MarkTerminal(
		ctx context.Context, noteID string, status model.ImportNoteStatus,
		targetDocumentID, resultAction, stableError string, now int64,
	) error
	Report(
		ctx context.Context, userID, jobID string,
	) (*model.ImportReport, int, error)
}

type ImportWorker struct {
	imports *ImportService
	jobs    importWorkerJobRepo
	notes   importWorkerNoteRepo
	runtime Runtime
	poll    time.Duration
}

var errImportWorkerDependencies = errors.New("import worker dependencies are required")

func NewImportWorker(
	imports *ImportService, jobs importWorkerJobRepo, notes importWorkerNoteRepo,
) *ImportWorker {
	if imports == nil {
		panic("import worker requires import service")
	}
	return &ImportWorker{
		imports: imports,
		jobs:    jobs,
		notes:   notes,
		runtime: imports.runtime,
		poll:    500 * time.Millisecond,
	}
}

func (worker *ImportWorker) Run(ctx context.Context) error {
	if worker.imports == nil || worker.jobs == nil || worker.notes == nil {
		return errImportWorkerDependencies
	}
	for {
		select {
		case <-ctx.Done():
			return nil
		default:
		}
		now := worker.runtime.Clock.Now()
		job, err := worker.jobs.Claim(
			ctx, now.Unix(), now.Add(importLeaseDuration).Unix(),
		)
		if errors.Is(err, appErr.ErrNoWork) {
			if !waitImportPoll(ctx, worker.poll) {
				return nil
			}
			continue
		}
		if err != nil {
			logutil.GetLogger(ctx).Error("claim import job failed", zap.Error(err))
			if !waitImportPoll(ctx, worker.poll) {
				return nil
			}
			continue
		}
		if job == nil {
			if !waitImportPoll(ctx, worker.poll) {
				return nil
			}
			continue
		}
		worker.processClaimed(ctx, job)
	}
}

func waitImportPoll(ctx context.Context, duration time.Duration) bool {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

func (worker *ImportWorker) processClaimed(ctx context.Context, job *model.ImportJob) {
	logger := logutil.GetLogger(ctx).With(zap.String("job_id", job.ID))
	defer func() {
		if recovered := recover(); recovered != nil {
			logger.Error("import worker panic", zap.Any("panic", recovered))
			worker.releaseFailure(ctx, job, "internal worker panic")
		}
	}()
	for {
		if err := ctx.Err(); err != nil {
			return
		}
		done, err := worker.processNextNote(ctx, job)
		if err != nil {
			logger.Error("process import note failed", zap.Error(err))
			worker.releaseFailure(ctx, job, "dependency failure")
			return
		}
		if done {
			logger.Info("import job completed")
			return
		}
	}
}

func (worker *ImportWorker) processNextNote(
	ctx context.Context, job *model.ImportJob,
) (bool, error) {
	done := false
	err := worker.runtime.Transactor.WithinTransaction(ctx, func(txCtx context.Context) error {
		note, err := worker.notes.NextPending(txCtx, job.UserID, job.ID)
		if errors.Is(err, appErr.ErrNoWork) {
			err = nil
		}
		if err != nil {
			return fmt.Errorf("claim import note: %w", err)
		}
		now := worker.runtime.Clock.Now().Unix()
		if note == nil {
			report, processed, err := worker.notes.Report(txCtx, job.UserID, job.ID)
			if err != nil {
				return fmt.Errorf("build import report: %w", err)
			}
			if err := worker.jobs.Finish(
				txCtx, job.ID, report, processed, job.Total, now,
			); err != nil {
				return fmt.Errorf("finish import job: %w", err)
			}
			done = true
			return nil
		}
		outcome := worker.importNote(txCtx, job, note)
		if outcome.retryErr != nil {
			return outcome.retryErr
		}
		return worker.notes.MarkTerminal(
			txCtx, note.ID, outcome.status, outcome.documentID,
			outcome.action, outcome.stableError, now,
		)
	})
	if err != nil {
		return false, fmt.Errorf("process next import note transaction: %w", err)
	}
	return done, nil
}

type importNoteOutcome struct {
	status      model.ImportNoteStatus
	documentID  string
	action      string
	stableError string
	retryErr    error
}

func (worker *ImportWorker) importNote(
	ctx context.Context, job *model.ImportJob, note *model.ImportJobNote,
) importNoteOutcome {
	if strings.TrimSpace(note.Title) == "" ||
		(job.RequireContent && strings.TrimSpace(note.Content) == "") {
		return failedImportNote("invalid title or content")
	}
	existingID, exists, err := worker.imports.lookupByTitle(ctx, job.UserID, note.Title)
	if err != nil {
		return retryImportNote(err)
	}
	if exists && job.Mode == model.ImportModeSkip {
		return importNoteOutcome{
			status: model.ImportNoteStatusSkipped, documentID: existingID,
			action: "skipped",
		}
	}
	tagIDs, err := worker.imports.ensureTags(ctx, job.UserID, note.Tags)
	if err != nil {
		return classifyImportNoteError(err)
	}
	if exists && job.Mode == model.ImportModeOverwrite {
		var summary *string
		if note.Summary != "" {
			summary = &note.Summary
		}
		err := worker.imports.documents.Update(ctx, job.UserID, existingID, DocumentUpdateInput{
			Title: note.Title, Content: note.Content, TagIDs: tagIDs, Summary: summary,
		})
		if err != nil {
			return classifyImportNoteError(err)
		}
		return importNoteOutcome{
			status: model.ImportNoteStatusDone, documentID: existingID,
			action: "updated",
		}
	}
	title := note.Title
	if exists && job.Mode == model.ImportModeAppend {
		title = worker.imports.appendSuffix(ctx, job.UserID, note.Title)
	}
	document, err := worker.imports.documents.Create(ctx, job.UserID, DocumentCreateInput{
		Title: title, Content: note.Content, TagIDs: tagIDs, Summary: note.Summary,
	})
	if err != nil {
		return classifyImportNoteError(err)
	}
	return importNoteOutcome{
		status: model.ImportNoteStatusDone, documentID: document.ID,
		action: "created",
	}
}

func failedImportNote(message string) importNoteOutcome {
	return importNoteOutcome{
		status: model.ImportNoteStatusFailed, action: "failed", stableError: message,
	}
}

func retryImportNote(err error) importNoteOutcome {
	return importNoteOutcome{retryErr: err}
}

func classifyImportNoteError(err error) importNoteOutcome {
	if errors.Is(err, appErr.ErrInvalid) ||
		errors.Is(err, appErr.ErrConflict) ||
		errors.Is(err, appErr.ErrNotFound) {
		return failedImportNote("invalid imported note")
	}
	return retryImportNote(err)
}

func (worker *ImportWorker) releaseFailure(
	ctx context.Context, job *model.ImportJob, stableError string,
) {
	now := worker.runtime.Clock.Now()
	backoffMinutes := 1 << max(job.Attempts-1, 0)
	if backoffMinutes > 8 {
		backoffMinutes = 8
	}
	if err := worker.jobs.ReleaseAfterFailure(
		ctx, job.ID, stableError,
		now.Add(time.Duration(backoffMinutes)*time.Minute).Unix(), now.Unix(),
	); err != nil {
		logutil.GetLogger(ctx).Error(
			"release import job after failure failed",
			zap.String("job_id", job.ID),
			zap.Error(err),
		)
	}
}
