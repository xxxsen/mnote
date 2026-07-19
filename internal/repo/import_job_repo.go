package repo

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

type ImportJobRepo struct {
	db *sql.DB
}

var errInvalidImportJobState = errors.New("invalid persisted import job state")

func NewImportJobRepo(db *sql.DB) *ImportJobRepo {
	return &ImportJobRepo{db: db}
}

func (r *ImportJobRepo) Create(ctx context.Context, job *model.ImportJob) error {
	tagsJSON, err := json.Marshal(job.Tags)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	reportJSON := []byte("{}")
	if job.Report != nil {
		reportJSON, err = json.Marshal(job.Report)
		if err != nil {
			return fmt.Errorf("marshal: %w", err)
		}
	}
	const query = `
		INSERT INTO import_jobs (id, user_id, source, status, require_content, processed, total, tags_json, report_json,
			ctime, mtime)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`
	_, err = conn(ctx, r.db).ExecContext(ctx, query,
		job.ID,
		job.UserID,
		job.Source,
		job.Status,
		boolToInt(job.RequireContent),
		job.Processed,
		job.Total,
		string(tagsJSON),
		string(reportJSON),
		job.Ctime,
		job.Mtime,
	)
	if err != nil {
		return fmt.Errorf("insert import job: %w", err)
	}
	return nil
}

func (r *ImportJobRepo) Get(ctx context.Context, userID, jobID string) (*model.ImportJob, error) {
	const query = `
		SELECT id, user_id, source, status, require_content, processed, total, tags_json, report_json, ctime, mtime
		FROM import_jobs
		WHERE id = $1 AND user_id = $2
	`
	row := conn(ctx, r.db).QueryRowContext(ctx, query, jobID, userID)
	var job model.ImportJob
	var requireContent int
	var tagsJSON string
	var reportJSON string
	if err := row.Scan(
		&job.ID,
		&job.UserID,
		&job.Source,
		&job.Status,
		&requireContent,
		&job.Processed,
		&job.Total,
		&tagsJSON,
		&reportJSON,
		&job.Ctime,
		&job.Mtime,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, appErr.ErrNotFound
		}
		return nil, fmt.Errorf("repo: %w", err)
	}
	job.RequireContent = requireContent == 1
	if !job.Status.Valid() {
		return nil, fmt.Errorf(
			"%w: status=%q job=%s", errInvalidImportJobState, job.Status, job.ID,
		)
	}
	if tagsJSON != "" {
		if err := json.Unmarshal([]byte(tagsJSON), &job.Tags); err != nil {
			return nil, fmt.Errorf("decode import_jobs.tags_json for %s: %w", job.ID, err)
		}
	}
	if reportJSON != "" {
		var report model.ImportReport
		if err := json.Unmarshal([]byte(reportJSON), &report); err != nil {
			return nil, fmt.Errorf("decode import_jobs.report_json for %s: %w", job.ID, err)
		}
		job.Report = &report
	}
	return &job, nil
}

func (r *ImportJobRepo) Confirm(
	ctx context.Context, userID, jobID string, mode model.ImportMode, now int64,
) (bool, error) {
	if !mode.Valid() {
		return false, appErr.ErrInvalid
	}
	const query = `
		UPDATE import_jobs
		SET status = 'running',
			mode = $1,
			locked_until = 0,
			next_retry_at = 0,
			last_error = '',
			mtime = $2
		WHERE id = $3 AND user_id = $4 AND status = 'ready'
	`
	result, err := conn(ctx, r.db).ExecContext(ctx, query, mode, now, jobID, userID)
	if err != nil {
		return false, fmt.Errorf("confirm import job: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("confirm import job rows affected: %w", err)
	}
	return affected == 1, nil
}

func (r *ImportJobRepo) Claim(
	ctx context.Context, now, lockedUntil int64,
) (*model.ImportJob, error) {
	const query = `
		WITH candidate AS (
			SELECT id
			FROM import_jobs
			WHERE status = 'running'
			  AND locked_until <= $1
			  AND next_retry_at <= $1
			  AND attempts < 5
			ORDER BY ctime, id
			FOR UPDATE SKIP LOCKED
			LIMIT 1
		)
		UPDATE import_jobs job
		SET locked_until = $2,
			attempts = job.attempts + 1,
			mtime = $1
		FROM candidate
		WHERE job.id = candidate.id
		RETURNING job.id, job.user_id, job.source, job.status, job.mode,
			job.require_content, job.processed, job.total, job.tags_json,
			job.report_json, job.locked_until, job.attempts,
			job.next_retry_at, job.last_error, job.ctime, job.mtime
	`
	row := conn(ctx, r.db).QueryRowContext(ctx, query, now, lockedUntil)
	job, err := scanImportJob(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, appErr.ErrNoWork
	}
	if err != nil {
		return nil, fmt.Errorf("claim import job: %w", err)
	}
	return job, nil
}

func (r *ImportJobRepo) Finish(
	ctx context.Context, jobID string, report *model.ImportReport, processed, total int, now int64,
) error {
	reportJSON, err := json.Marshal(report)
	if err != nil {
		return fmt.Errorf("marshal import report: %w", err)
	}
	const query = `
		UPDATE import_jobs
		SET status = 'done',
			processed = $1,
			total = $2,
			report_json = $3,
			locked_until = 0,
			next_retry_at = 0,
			last_error = '',
			mtime = $4
		WHERE id = $5 AND status = 'running'
	`
	result, err := conn(ctx, r.db).ExecContext(
		ctx, query, processed, total, string(reportJSON), now, jobID,
	)
	if err != nil {
		return fmt.Errorf("finish import job: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("finish import job rows affected: %w", err)
	}
	if affected != 1 {
		return appErr.ErrConflict
	}
	return nil
}

func (r *ImportJobRepo) ReleaseAfterFailure(
	ctx context.Context, jobID, stableError string, nextRetryAt, now int64,
) error {
	const query = `
		UPDATE import_jobs
		SET status = CASE WHEN attempts >= 5 THEN 'failed' ELSE 'running' END,
			locked_until = 0,
			next_retry_at = CASE WHEN attempts >= 5 THEN 0 ELSE $1 END,
			last_error = LEFT($2, 500),
			mtime = $3
		WHERE id = $4 AND status = 'running'
	`
	result, err := conn(ctx, r.db).ExecContext(ctx, query, nextRetryAt, stableError, now, jobID)
	if err != nil {
		return fmt.Errorf("release failed import job: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("release failed import job rows affected: %w", err)
	}
	if affected != 1 {
		return appErr.ErrConflict
	}
	return nil
}

func (
	r *ImportJobRepo) UpdateStatusIf(ctx context.Context,
	userID,
	jobID,
	fromStatus,
	toStatus string,
	mtime int64) (bool,
	error,
) {
	const query = `
		UPDATE import_jobs
		SET status = $1, mtime = $2
		WHERE id = $3 AND user_id = $4 AND status = $5
	`
	res, err := conn(ctx, r.db).ExecContext(ctx, query, toStatus, mtime, jobID, userID, fromStatus)
	if err != nil {
		return false, fmt.Errorf("exec: %w", err)
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("rows affected: %w", err)
	}
	return affected > 0, nil
}

func (r *ImportJobRepo) UpdateSummary(ctx context.Context, job *model.ImportJob) error {
	tagsJSON, err := json.Marshal(job.Tags)
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	reportJSON := []byte("{}")
	if job.Report != nil {
		reportJSON, err = json.Marshal(job.Report)
		if err != nil {
			return fmt.Errorf("marshal: %w", err)
		}
	}
	const query = `
		UPDATE import_jobs
		SET status = $1,
			require_content = $2,
			processed = $3,
			total = $4,
			tags_json = $5,
			report_json = $6,
			mtime = $7
		WHERE id = $8 AND user_id = $9
	`
	res, err := conn(ctx, r.db).ExecContext(ctx, query,
		job.Status,
		boolToInt(job.RequireContent),
		job.Processed,
		job.Total,
		string(tagsJSON),
		string(reportJSON),
		job.Mtime,
		job.ID,
		job.UserID,
	)
	if err != nil {
		return fmt.Errorf("repo: %w", err)
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("rows affected: %w", err)
	}
	if affected == 0 {
		return appErr.ErrNotFound
	}
	return nil
}

func (
	r *ImportJobRepo) UpdateProgress(ctx context.Context,
	userID,
	jobID string,
	processed,
	total int,
	report *model.ImportReport,
	status string,
	mtime int64,
) error {
	reportJSON := []byte("{}")
	if report != nil {
		var err error
		reportJSON, err = json.Marshal(report)
		if err != nil {
			return fmt.Errorf("marshal: %w", err)
		}
	}
	const query = `
		UPDATE import_jobs
		SET processed = $1,
			total = $2,
			report_json = $3,
			status = $4,
			mtime = $5
		WHERE id = $6 AND user_id = $7
	`
	res, err := conn(ctx, r.db).ExecContext(
		ctx, query, processed, total, string(reportJSON), status, mtime, jobID, userID,
	)
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	if affected == 0 {
		return appErr.ErrNotFound
	}
	return nil
}

func (r *ImportJobRepo) DeleteBefore(ctx context.Context, cutoff int64) (int64, error) {
	const query = `
		DELETE FROM import_jobs
		WHERE id IN (
			SELECT id
			FROM import_jobs
			WHERE status IN ('done', 'failed') AND mtime < $1
			ORDER BY mtime, id
			LIMIT 500
		)
	`
	res, err := conn(ctx, r.db).ExecContext(ctx, query, cutoff)
	if err != nil {
		return 0, fmt.Errorf("exec: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("rows affected: %w", err)
	}
	return n, nil
}

func scanImportJob(scanner interface{ Scan(...any) error }) (*model.ImportJob, error) {
	var job model.ImportJob
	var requireContent int
	var tagsJSON, reportJSON string
	if err := scanner.Scan(
		&job.ID, &job.UserID, &job.Source, &job.Status, &job.Mode,
		&requireContent, &job.Processed, &job.Total, &tagsJSON, &reportJSON,
		&job.LockedUntil, &job.Attempts, &job.NextRetryAt, &job.LastError,
		&job.Ctime, &job.Mtime,
	); err != nil {
		return nil, fmt.Errorf("scan import job: %w", err)
	}
	if !job.Status.Valid() {
		return nil, fmt.Errorf(
			"%w: status=%q job=%s", errInvalidImportJobState, job.Status, job.ID,
		)
	}
	if !job.Mode.Valid() {
		return nil, fmt.Errorf(
			"%w: mode=%q job=%s", errInvalidImportJobState, job.Mode, job.ID,
		)
	}
	job.RequireContent = requireContent == 1
	if err := json.Unmarshal([]byte(tagsJSON), &job.Tags); err != nil {
		return nil, fmt.Errorf("decode import_jobs.tags_json for %s: %w", job.ID, err)
	}
	var report model.ImportReport
	if err := json.Unmarshal([]byte(reportJSON), &report); err != nil {
		return nil, fmt.Errorf("decode import_jobs.report_json for %s: %w", job.ID, err)
	}
	job.Report = &report
	return &job, nil
}

func (r *ImportJobRepo) Delete(ctx context.Context, userID, jobID string) error {
	const query = `DELETE FROM import_jobs WHERE id = $1 AND user_id = $2`
	_, err := conn(ctx, r.db).ExecContext(ctx, query, jobID, userID)
	if err != nil {
		return fmt.Errorf("delete import job: %w", err)
	}
	return nil
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
