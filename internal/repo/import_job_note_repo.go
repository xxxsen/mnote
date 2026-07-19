package repo

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/didi/gendry/builder"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/dbutil"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

type ImportJobNoteRepo struct {
	db *sql.DB
}

var (
	errInvalidImportNoteTransition = errors.New("invalid import note transition")
	errInvalidImportNoteState      = errors.New("invalid persisted import note state")
)

func NewImportJobNoteRepo(db *sql.DB) *ImportJobNoteRepo {
	return &ImportJobNoteRepo{db: db}
}

func (r *ImportJobNoteRepo) InsertBatch(ctx context.Context, notes []model.ImportJobNote) error {
	if len(notes) == 0 {
		return nil
	}
	data := make([]map[string]any, 0, len(notes))
	for _, note := range notes {
		tagsJSON, err := json.Marshal(note.Tags)
		if err != nil {
			return fmt.Errorf("marshal: %w", err)
		}
		data = append(data, map[string]any{
			"id":        note.ID,
			"job_id":    note.JobID,
			"user_id":   note.UserID,
			"position":  note.Position,
			"title":     note.Title,
			"content":   note.Content,
			"summary":   note.Summary,
			"tags_json": string(tagsJSON),
			"source":    note.Source,
			"status":    model.ImportNoteStatusPending,
			"mtime":     note.Ctime,
			"ctime":     note.Ctime,
		})
	}
	sqlStr, args, err := builder.BuildInsert("import_job_notes", data)
	if err != nil {
		return fmt.Errorf("build insert: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	if _, err = conn(ctx, r.db).ExecContext(ctx, sqlStr, args...); err != nil {
		return fmt.Errorf("insert batch notes: %w", err)
	}
	return nil
}

func (r *ImportJobNoteRepo) NextPending(
	ctx context.Context, userID, jobID string,
) (*model.ImportJobNote, error) {
	const query = `
		SELECT id, job_id, user_id, position, title, content, summary,
			tags_json, source, status, target_document_id, result_action,
			last_error, ctime, mtime
		FROM import_job_notes
		WHERE job_id = $1 AND user_id = $2 AND status = 'pending'
		ORDER BY position
		FOR UPDATE SKIP LOCKED
		LIMIT 1
	`
	row := conn(ctx, r.db).QueryRowContext(ctx, query, jobID, userID)
	note, err := scanImportJobNote(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, appErr.ErrNoWork
	}
	if err != nil {
		return nil, fmt.Errorf("next pending import note: %w", err)
	}
	return note, nil
}

func (r *ImportJobNoteRepo) MarkTerminal(
	ctx context.Context, noteID string, status model.ImportNoteStatus,
	targetDocumentID, resultAction, stableError string, now int64,
) error {
	if !status.Valid() || status == model.ImportNoteStatusPending {
		return fmt.Errorf("%w: %q", errInvalidImportNoteTransition, status)
	}
	const query = `
		UPDATE import_job_notes
		SET status = $1,
			target_document_id = NULLIF($2, ''),
			result_action = NULLIF($3, ''),
			last_error = LEFT($4, 500),
			mtime = $5
		WHERE id = $6 AND status = 'pending'
	`
	result, err := conn(ctx, r.db).ExecContext(
		ctx, query, status, targetDocumentID, resultAction, stableError, now, noteID,
	)
	if err != nil {
		return fmt.Errorf("mark import note terminal: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("mark import note terminal rows affected: %w", err)
	}
	if affected != 1 {
		return appErr.ErrConflict
	}
	return nil
}

func (r *ImportJobNoteRepo) Report(
	ctx context.Context, userID, jobID string,
) (*model.ImportReport, int, error) {
	const query = `
		SELECT
			COUNT(*) FILTER (WHERE result_action = 'created'),
			COUNT(*) FILTER (WHERE result_action = 'updated'),
			COUNT(*) FILTER (WHERE status = 'skipped'),
			COUNT(*) FILTER (WHERE status = 'failed'),
			COUNT(*) FILTER (WHERE status <> 'pending')
		FROM import_job_notes
		WHERE job_id = $1 AND user_id = $2
	`
	var report model.ImportReport
	var processed int
	if err := conn(ctx, r.db).QueryRowContext(ctx, query, jobID, userID).Scan(
		&report.Created, &report.Updated, &report.Skipped, &report.Failed, &processed,
	); err != nil {
		return nil, 0, fmt.Errorf("build import report: %w", err)
	}
	const errorsQuery = `
		SELECT LEFT(last_error, 500), LEFT(title, 200)
		FROM import_job_notes
		WHERE job_id = $1 AND user_id = $2 AND status = 'failed'
		ORDER BY position
		LIMIT 100
	`
	rows, err := conn(ctx, r.db).QueryContext(ctx, errorsQuery, jobID, userID)
	if err != nil {
		return nil, 0, fmt.Errorf("list import report errors: %w", err)
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var message, title string
		if err := rows.Scan(&message, &title); err != nil {
			return nil, 0, fmt.Errorf("scan import report error: %w", err)
		}
		report.Errors = append(report.Errors, message)
		report.FailedTitles = append(report.FailedTitles, title)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate import report errors: %w", err)
	}
	return &report, processed, nil
}

func scanImportJobNote(scanner interface{ Scan(...any) error }) (*model.ImportJobNote, error) {
	var note model.ImportJobNote
	var tagsJSON string
	var targetDocumentID, resultAction sql.NullString
	if err := scanner.Scan(
		&note.ID, &note.JobID, &note.UserID, &note.Position,
		&note.Title, &note.Content, &note.Summary, &tagsJSON, &note.Source,
		&note.Status, &targetDocumentID, &resultAction, &note.LastError,
		&note.Ctime, &note.Mtime,
	); err != nil {
		return nil, fmt.Errorf("scan import job note: %w", err)
	}
	if !note.Status.Valid() {
		return nil, fmt.Errorf(
			"%w: status=%q note=%s", errInvalidImportNoteState, note.Status, note.ID,
		)
	}
	if err := json.Unmarshal([]byte(tagsJSON), &note.Tags); err != nil {
		return nil, fmt.Errorf("decode import_job_notes.tags_json for %s: %w", note.ID, err)
	}
	note.TargetDocumentID = targetDocumentID.String
	note.ResultAction = resultAction.String
	return &note, nil
}

func (r *ImportJobNoteRepo) ListByJob(ctx context.Context, userID, jobID string) ([]model.ImportJobNote, error) {
	const query = `
		SELECT id, job_id, user_id, position, title, content, summary, tags_json, source, ctime
		FROM import_job_notes
		WHERE job_id = $1 AND user_id = $2
		ORDER BY position ASC
	`
	rows, err := conn(ctx, r.db).QueryContext(ctx, query, jobID, userID)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var result []model.ImportJobNote
	for rows.Next() {
		var note model.ImportJobNote
		var tagsJSON string
		if err := rows.Scan(
			&note.ID,
			&note.JobID,
			&note.UserID,
			&note.Position,
			&note.Title,
			&note.Content,
			&note.Summary,
			&tagsJSON,
			&note.Source,
			&note.Ctime,
		); err != nil {
			return nil, fmt.Errorf("repo: %w", err)
		}
		if tagsJSON != "" {
			if err := json.Unmarshal([]byte(tagsJSON), &note.Tags); err != nil {
				return nil, fmt.Errorf(
					"decode import_job_notes.tags_json for %s: %w", note.ID, err,
				)
			}
		}
		result = append(result, note)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}
	return result, nil
}

func (
	r *ImportJobNoteRepo) ListByJobLimit(ctx context.Context,
	userID,
	jobID string,
	limit int) ([]model.ImportJobNote,
	error,
) {
	const query = `
		SELECT id, job_id, user_id, position, title, content, summary, tags_json, source, ctime
		FROM import_job_notes
		WHERE job_id = $1 AND user_id = $2
		ORDER BY position ASC
		LIMIT $3
	`
	rows, err := conn(ctx, r.db).QueryContext(ctx, query, jobID, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var result []model.ImportJobNote
	for rows.Next() {
		var note model.ImportJobNote
		var tagsJSON string
		if err := rows.Scan(
			&note.ID,
			&note.JobID,
			&note.UserID,
			&note.Position,
			&note.Title,
			&note.Content,
			&note.Summary,
			&tagsJSON,
			&note.Source,
			&note.Ctime,
		); err != nil {
			return nil, fmt.Errorf("repo: %w", err)
		}
		if tagsJSON != "" {
			if err := json.Unmarshal([]byte(tagsJSON), &note.Tags); err != nil {
				return nil, fmt.Errorf(
					"decode import_job_notes.tags_json for %s: %w", note.ID, err,
				)
			}
		}
		result = append(result, note)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("unmarshal: %w", err)
	}
	return result, nil
}

func (r *ImportJobNoteRepo) ListTitles(ctx context.Context, userID, jobID string) ([]string, error) {
	const query = `
		SELECT title
		FROM import_job_notes
		WHERE job_id = $1 AND user_id = $2
		ORDER BY position ASC
	`
	rows, err := conn(ctx, r.db).QueryContext(ctx, query, jobID, userID)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var titles []string
	for rows.Next() {
		var title string
		if err := rows.Scan(&title); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		titles = append(titles, title)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("scan: %w", err)
	}
	return titles, nil
}

func (r *ImportJobNoteRepo) DeleteBefore(ctx context.Context, cutoff int64) (int64, error) {
	const query = `DELETE FROM import_job_notes WHERE ctime < $1`
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
