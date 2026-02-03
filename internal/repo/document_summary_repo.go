package repo

import (
	"context"
	"database/sql"

	"github.com/jmoiron/sqlx"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

type DocumentSummaryRepo struct {
	db *sql.DB
}

func NewDocumentSummaryRepo(db *sql.DB) *DocumentSummaryRepo {
	return &DocumentSummaryRepo{db: db}
}

func (r *DocumentSummaryRepo) Upsert(ctx context.Context, userID, docID, summary string, now int64) error {
	const query = `
		INSERT INTO document_summaries (document_id, user_id, summary, ctime, mtime)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (document_id) DO UPDATE SET
			user_id = EXCLUDED.user_id,
			summary = EXCLUDED.summary,
			mtime = EXCLUDED.mtime
	`
	_, err := r.db.ExecContext(ctx, query, docID, userID, summary, now, now)
	return err
}

func (r *DocumentSummaryRepo) GetByDocID(ctx context.Context, userID, docID string) (string, error) {
	const query = `SELECT summary FROM document_summaries WHERE document_id = $1 AND user_id = $2`
	row := r.db.QueryRowContext(ctx, query, docID, userID)
	var summary string
	if err := row.Scan(&summary); err != nil {
		if err == sql.ErrNoRows {
			return "", appErr.ErrNotFound
		}
		return "", err
	}
	return summary, nil
}

func (r *DocumentSummaryRepo) ListByDocIDs(ctx context.Context, userID string, docIDs []string) (map[string]string, error) {
	if len(docIDs) == 0 {
		return map[string]string{}, nil
	}
	query := `SELECT document_id, summary FROM document_summaries WHERE user_id = ? AND document_id IN (?)`
	query, args, err := sqlx.In(query, userID, docIDs)
	if err != nil {
		return nil, err
	}
	query = sqlx.Rebind(sqlx.DOLLAR, query)
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := make(map[string]string)
	for rows.Next() {
		var docID string
		var summary string
		if err := rows.Scan(&docID, &summary); err != nil {
			return nil, err
		}
		result[docID] = summary
	}
	return result, rows.Err()
}

func (r *DocumentSummaryRepo) ListPendingDocuments(ctx context.Context, limit int, maxMtime int64) ([]model.Document, error) {
	const query = `
		SELECT d.id, d.user_id, d.title, d.content
		FROM documents d
		LEFT JOIN document_summaries s ON d.id = s.document_id
		WHERE d.state = $1
			AND (s.document_id IS NULL OR d.mtime > s.mtime)
			AND d.mtime < $2
		LIMIT $3
	`
	rows, err := r.db.QueryContext(ctx, query, DocumentStateNormal, maxMtime, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var docs []model.Document
	for rows.Next() {
		var doc model.Document
		if err := rows.Scan(&doc.ID, &doc.UserID, &doc.Title, &doc.Content); err != nil {
			return nil, err
		}
		docs = append(docs, doc)
	}
	return docs, rows.Err()
}
