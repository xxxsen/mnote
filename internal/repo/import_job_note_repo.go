package repo

import (
	"context"
	"database/sql"
	"encoding/json"

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
	data := make([]map[string]interface{}, 0, len(notes))
	for _, note := range notes {
		tagsJSON, err := json.Marshal(note.Tags)
		if err != nil {
			return err
		}
		data = append(data, map[string]interface{}{
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
		return err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	_, err = r.db.ExecContext(ctx, sqlStr, args...)
	return err
}

func (r *ImportJobNoteRepo) ListByJob(ctx context.Context, userID, jobID string) ([]model.ImportJobNote, error) {
	const query = `
		SELECT id, job_id, user_id, position, title, content, summary, tags_json, source, ctime
		FROM import_job_notes
		WHERE job_id = $1 AND user_id = $2
		ORDER BY position ASC
	`
	rows, err := r.db.QueryContext(ctx, query, jobID, userID)
	if err != nil {
		return nil, err
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
			return nil, err
		}
		if tagsJSON != "" {
			_ = json.Unmarshal([]byte(tagsJSON), &note.Tags)
		}
		result = append(result, note)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func (r *ImportJobNoteRepo) ListByJobLimit(ctx context.Context, userID, jobID string, limit int) ([]model.ImportJobNote, error) {
	const query = `
		SELECT id, job_id, user_id, position, title, content, summary, tags_json, source, ctime
		FROM import_job_notes
		WHERE job_id = $1 AND user_id = $2
		ORDER BY position ASC
		LIMIT $3
	`
	rows, err := r.db.QueryContext(ctx, query, jobID, userID, limit)
	if err != nil {
		return nil, err
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
			return nil, err
		}
		if tagsJSON != "" {
			_ = json.Unmarshal([]byte(tagsJSON), &note.Tags)
		}
		result = append(result, note)
	}
	if err := rows.Err(); err != nil {
		return nil, err
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
	rows, err := r.db.QueryContext(ctx, query, jobID, userID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	var titles []string
	for rows.Next() {
		var title string
		if err := rows.Scan(&title); err != nil {
			return nil, err
		}
		titles = append(titles, title)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return titles, nil
}

func (r *ImportJobNoteRepo) DeleteBefore(ctx context.Context, cutoff int64) (int64, error) {
	const query = `DELETE FROM import_job_notes WHERE ctime < $1`
	res, err := r.db.ExecContext(ctx, query, cutoff)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}
