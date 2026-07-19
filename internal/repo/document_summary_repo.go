package repo

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

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
	_, err := conn(ctx, r.db).ExecContext(ctx, query, docID, userID, summary, now, now)
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	return nil
}

func (r *DocumentSummaryRepo) MarkPending(
	ctx context.Context, userID, docID, sourceHash string, now int64,
) error {
	const query = `
		INSERT INTO document_summaries (
			document_id, user_id, summary, source_content_hash, status,
			attempts, next_retry_at, locked_until, last_error, ctime, mtime
		)
		VALUES ($1, $2, '', $3, 'pending', 0, 0, 0, '', $4, $4)
		ON CONFLICT (document_id) DO UPDATE SET
			user_id = EXCLUDED.user_id,
			source_content_hash = EXCLUDED.source_content_hash,
			status = 'pending',
			attempts = 0,
			next_retry_at = 0,
			locked_until = 0,
			last_error = '',
			mtime = EXCLUDED.mtime
	`
	if _, err := conn(ctx, r.db).ExecContext(
		ctx, query, docID, userID, sourceHash, now,
	); err != nil {
		return fmt.Errorf("mark summary pending: %w", err)
	}
	return nil
}

func (r *DocumentSummaryRepo) UpsertSucceeded(
	ctx context.Context, userID, docID, summary, sourceHash string, now int64,
) error {
	const query = `
		INSERT INTO document_summaries (
			document_id, user_id, summary, source_content_hash, status,
			attempts, next_retry_at, locked_until, last_error, ctime, mtime
		)
		VALUES ($1, $2, $3, $4, 'succeeded', 0, 0, 0, '', $5, $5)
		ON CONFLICT (document_id) DO UPDATE SET
			user_id = EXCLUDED.user_id,
			summary = EXCLUDED.summary,
			source_content_hash = EXCLUDED.source_content_hash,
			status = 'succeeded',
			attempts = 0,
			next_retry_at = 0,
			locked_until = 0,
			last_error = '',
			mtime = EXCLUDED.mtime
	`
	if _, err := conn(ctx, r.db).ExecContext(
		ctx, query, docID, userID, summary, sourceHash, now,
	); err != nil {
		return fmt.Errorf("upsert succeeded summary: %w", err)
	}
	return nil
}

func (r *DocumentSummaryRepo) Claim(
	ctx context.Context, now, pendingBefore, lockedUntil int64,
) (*model.SummaryTask, error) {
	const query = `
		WITH candidate AS (
			SELECT summary.document_id
			FROM document_summaries summary
			JOIN documents document
			  ON document.id = summary.document_id
			 AND document.user_id = summary.user_id
			WHERE document.state = $1
			  AND (
				(summary.status = 'pending' AND summary.mtime <= $2)
				OR (summary.status = 'failed' AND summary.next_retry_at <= $3)
				OR (summary.status = 'running' AND summary.locked_until <= $3)
			  )
			ORDER BY summary.mtime, summary.document_id
			FOR UPDATE OF summary SKIP LOCKED
			LIMIT 1
		)
		UPDATE document_summaries summary
		SET status = 'running',
			attempts = summary.attempts + 1,
			locked_until = $4,
			last_error = '',
			mtime = $3
		FROM candidate, documents document
		WHERE summary.document_id = candidate.document_id
		  AND document.id = summary.document_id
		  AND document.user_id = summary.user_id
		RETURNING document.id, document.user_id, document.title,
			document.content, summary.source_content_hash, summary.attempts
	`
	row := conn(ctx, r.db).QueryRowContext(
		ctx, query, DocumentStateNormal, pendingBefore, now, lockedUntil,
	)
	var task model.SummaryTask
	if err := row.Scan(
		&task.DocumentID, &task.UserID, &task.Title, &task.Content,
		&task.SourceContentHash, &task.Attempts,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, appErr.ErrNoWork
		}
		return nil, fmt.Errorf("claim summary: %w", err)
	}
	return &task, nil
}

func (r *DocumentSummaryRepo) CompleteIfCurrent(
	ctx context.Context, task *model.SummaryTask, summary string, now int64,
) (bool, error) {
	const query = `
		WITH current_document AS (
			SELECT content_hash
			FROM documents
			WHERE id = $1 AND user_id = $2 AND state = $3
			FOR UPDATE
		), updated AS (
			UPDATE document_summaries target
			SET summary = CASE
					WHEN current_document.content_hash = $4 THEN $5
					ELSE target.summary
				END,
				source_content_hash = current_document.content_hash,
				status = CASE
					WHEN current_document.content_hash = $4 THEN 'succeeded'
					ELSE 'pending'
				END,
				attempts = CASE
					WHEN current_document.content_hash = $4 THEN target.attempts
					ELSE 0
				END,
				next_retry_at = 0,
				locked_until = 0,
				last_error = '',
				mtime = $6
			FROM current_document
			WHERE target.document_id = $1 AND target.user_id = $2
			RETURNING current_document.content_hash = $4 AS applied
		)
		SELECT applied FROM updated
	`
	var applied bool
	if err := conn(ctx, r.db).QueryRowContext(
		ctx, query, task.DocumentID, task.UserID, DocumentStateNormal,
		task.SourceContentHash, summary, now,
	).Scan(&applied); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, appErr.ErrNotFound
		}
		return false, fmt.Errorf("complete summary: %w", err)
	}
	return applied, nil
}

func (r *DocumentSummaryRepo) MarkFailed(
	ctx context.Context, documentID, stableError string, nextRetryAt, now int64,
) error {
	const query = `
		UPDATE document_summaries
		SET status = 'failed',
			next_retry_at = $1,
			locked_until = 0,
			last_error = LEFT($2, 500),
			mtime = $3
		WHERE document_id = $4 AND status = 'running'
	`
	result, err := conn(ctx, r.db).ExecContext(
		ctx, query, nextRetryAt, stableError, now, documentID,
	)
	if err != nil {
		return fmt.Errorf("mark summary failed: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("mark summary failed rows affected: %w", err)
	}
	if affected != 1 {
		return appErr.ErrConflict
	}
	return nil
}

func (r *DocumentSummaryRepo) GetByDocID(ctx context.Context, userID, docID string) (string, error) {
	const query = `SELECT summary FROM document_summaries WHERE document_id = $1 AND user_id = $2`
	row := conn(ctx, r.db).QueryRowContext(ctx, query, docID, userID)
	var summary string
	if err := row.Scan(&summary); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", appErr.ErrNotFound
		}
		return "", fmt.Errorf("query: %w", err)
	}
	return summary, nil
}

func (
	r *DocumentSummaryRepo) ListByDocIDs(ctx context.Context,
	userID string,
	docIDs []string) (map[string]string,
	error,
) {
	if len(docIDs) == 0 {
		return map[string]string{}, nil
	}
	query := `SELECT document_id, summary FROM document_summaries WHERE user_id = ? AND document_id IN (?)`
	query, args, err := sqlx.In(query, userID, docIDs)
	if err != nil {
		return nil, fmt.Errorf("build in clause: %w", err)
	}
	query = sqlx.Rebind(sqlx.DOLLAR, query)
	rows, err := conn(ctx, r.db).QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	result := make(map[string]string)
	for rows.Next() {
		var docID string
		var summary string
		if err := rows.Scan(&docID, &summary); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		result[docID] = summary
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return result, nil
}

func (r *DocumentSummaryRepo) ListPendingDocuments(
	ctx context.Context, limit int, maxMtime int64,
) ([]model.Document, error) {
	const q = `
		SELECT d.id, d.user_id, d.title, d.content
		FROM documents d
		LEFT JOIN document_summaries s ON d.id = s.document_id
		WHERE d.state = $1
			AND (s.document_id IS NULL OR d.mtime > s.mtime)
			AND d.mtime < $2
		LIMIT $3
	`
	return queryBasicDocuments(ctx, conn(ctx, r.db), q, DocumentStateNormal, maxMtime, limit)
}
