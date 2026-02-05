package repo

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

type ImportJobRepo struct {
	db *sql.DB
}

func NewImportJobRepo(db *sql.DB) *ImportJobRepo {
	return &ImportJobRepo{db: db}
}

func (r *ImportJobRepo) Create(ctx context.Context, job *model.ImportJob) error {
	tagsJSON, err := json.Marshal(job.Tags)
	if err != nil {
		return err
	}
	reportJSON := []byte("{}")
	if job.Report != nil {
		reportJSON, err = json.Marshal(job.Report)
		if err != nil {
			return err
		}
	}
	const query = `
		INSERT INTO import_jobs (id, user_id, source, status, require_content, processed, total, tags_json, report_json, ctime, mtime)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`
	_, err = r.db.ExecContext(ctx, query,
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
	return err
}

func (r *ImportJobRepo) Get(ctx context.Context, userID, jobID string) (*model.ImportJob, error) {
	const query = `
		SELECT id, user_id, source, status, require_content, processed, total, tags_json, report_json, ctime, mtime
		FROM import_jobs
		WHERE id = $1 AND user_id = $2
	`
	row := r.db.QueryRowContext(ctx, query, jobID, userID)
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
		if err == sql.ErrNoRows {
			return nil, appErr.ErrNotFound
		}
		return nil, err
	}
	job.RequireContent = requireContent == 1
	if tagsJSON != "" {
		_ = json.Unmarshal([]byte(tagsJSON), &job.Tags)
	}
	if reportJSON != "" {
		var report model.ImportReport
		if err := json.Unmarshal([]byte(reportJSON), &report); err == nil {
			job.Report = &report
		}
	}
	return &job, nil
}

func (r *ImportJobRepo) UpdateStatusIf(ctx context.Context, userID, jobID, fromStatus, toStatus string, mtime int64) (bool, error) {
	const query = `
		UPDATE import_jobs
		SET status = $1, mtime = $2
		WHERE id = $3 AND user_id = $4 AND status = $5
	`
	res, err := r.db.ExecContext(ctx, query, toStatus, mtime, jobID, userID, fromStatus)
	if err != nil {
		return false, err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return affected > 0, nil
}

func (r *ImportJobRepo) UpdateSummary(ctx context.Context, job *model.ImportJob) error {
	tagsJSON, err := json.Marshal(job.Tags)
	if err != nil {
		return err
	}
	reportJSON := []byte("{}")
	if job.Report != nil {
		reportJSON, err = json.Marshal(job.Report)
		if err != nil {
			return err
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
	res, err := r.db.ExecContext(ctx, query,
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
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return appErr.ErrNotFound
	}
	return nil
}

func (r *ImportJobRepo) UpdateProgress(ctx context.Context, userID, jobID string, processed, total int, report *model.ImportReport, status string, mtime int64) error {
	reportJSON := []byte("{}")
	if report != nil {
		var err error
		reportJSON, err = json.Marshal(report)
		if err != nil {
			return err
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
	res, err := r.db.ExecContext(ctx, query, processed, total, string(reportJSON), status, mtime, jobID, userID)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return appErr.ErrNotFound
	}
	return nil
}

func (r *ImportJobRepo) DeleteBefore(ctx context.Context, cutoff int64) (int64, error) {
	const query = `DELETE FROM import_jobs WHERE ctime < $1`
	res, err := r.db.ExecContext(ctx, query, cutoff)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

func (r *ImportJobRepo) Delete(ctx context.Context, userID, jobID string) error {
	const query = `DELETE FROM import_jobs WHERE id = $1 AND user_id = $2`
	_, err := r.db.ExecContext(ctx, query, jobID, userID)
	return err
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}
