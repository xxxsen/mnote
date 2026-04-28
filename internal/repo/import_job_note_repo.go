package repo

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/didi/gendry/builder"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/dbutil"
)

type ImportJobNoteRepo struct {
	db *sql.DB
}

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
			_ = json.Unmarshal([]byte(tagsJSON), &note.Tags)
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
			_ = json.Unmarshal([]byte(tagsJSON), &note.Tags)
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
