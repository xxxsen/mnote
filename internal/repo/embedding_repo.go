package repo

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/pgvector/pgvector-go"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

type EmbeddingRepo struct {
	db *sql.DB
}

func NewEmbeddingRepo(db *sql.DB) *EmbeddingRepo {
	return &EmbeddingRepo{db: db}
}

// Save upserts the document_embeddings record and resets the retry state to
// the succeeded terminal state. The caller is expected to use this only on
// the success path; failures should go through MarkFailed.
func (r *EmbeddingRepo) Save(ctx context.Context, emb *model.DocumentEmbedding) error {
	const query = `
		INSERT INTO document_embeddings (
			document_id, user_id, content_hash, mtime,
			embedding_status, attempts, next_retry_at, locked_until, last_error
		)
		VALUES ($1, $2, $3, $4, 'succeeded', 0, 0, 0, '')
		ON CONFLICT (document_id) DO UPDATE SET
			user_id = EXCLUDED.user_id,
			content_hash = EXCLUDED.content_hash,
			mtime = EXCLUDED.mtime,
			embedding_status = 'succeeded',
			attempts = 0,
			next_retry_at = 0,
			locked_until = 0,
			last_error = ''
	`
	_, err := conn(ctx, r.db).ExecContext(ctx, query, emb.DocumentID, emb.UserID, emb.ContentHash, emb.Mtime)
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	return nil
}

// UpsertPending marks a document's embedding as pending so the queue picks
// it up. It clears all transient retry/error fields. Designed to be called
// from the save transaction right after content changes.
func (r *EmbeddingRepo) UpsertPending(
	ctx context.Context, docID, userID, contentHash string, contentMtime int64,
) error {
	const query = `
		INSERT INTO document_embeddings (
			document_id, user_id, content_hash, mtime,
			embedding_status, attempts, next_retry_at, locked_until, last_error
		)
		VALUES ($1, $2, $3, $4, 'pending', 0, 0, 0, '')
		ON CONFLICT (document_id) DO UPDATE SET
			user_id = EXCLUDED.user_id,
			content_hash = EXCLUDED.content_hash,
			mtime = EXCLUDED.mtime,
			embedding_status = 'pending',
			attempts = 0,
			next_retry_at = 0,
			locked_until = 0,
			last_error = ''
	`
	_, err := conn(ctx, r.db).ExecContext(ctx, query, docID, userID, contentHash, contentMtime)
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	return nil
}

// MarkFailed records a failed embedding attempt with exponential backoff
// metadata. attempts is incremented atomically and locked_until is cleared so
// the row becomes eligible for retry once next_retry_at <= now.
func (r *EmbeddingRepo) MarkFailed(
	ctx context.Context, docID, errMsg string, nextRetryAt int64,
) error {
	const query = `
		UPDATE document_embeddings
		SET embedding_status = 'failed',
			attempts = attempts + 1,
			next_retry_at = $2,
			locked_until = 0,
			last_error = $3
		WHERE document_id = $1
	`
	if _, err := conn(ctx, r.db).ExecContext(ctx, query, docID, nextRetryAt, errMsg); err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	return nil
}

// Claim attempts to atomically claim a document for embedding work. It only
// succeeds when the row is currently pending or failed and its lease has
// expired; the (status -> running, locked_until) update happens in a single
// statement so two concurrent workers cannot both win.
func (r *EmbeddingRepo) Claim(
	ctx context.Context, docID string, lockedUntil, now int64,
) (bool, error) {
	const query = `
		UPDATE document_embeddings
		SET embedding_status = 'running',
			locked_until = $2
		WHERE document_id = $1
			AND embedding_status IN ('pending', 'failed')
			AND next_retry_at <= $3
			AND locked_until < $3
	`
	res, err := conn(ctx, r.db).ExecContext(ctx, query, docID, lockedUntil, now)
	if err != nil {
		return false, fmt.Errorf("exec: %w", err)
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("rows affected: %w", err)
	}
	return affected > 0, nil
}

func (r *EmbeddingRepo) SaveChunks(ctx context.Context, chunks []*model.ChunkEmbedding) error {
	if len(chunks) == 0 {
		return nil
	}
	const query = `
		INSERT INTO chunk_embeddings (chunk_id, document_id, user_id, content, embedding, token_count, chunk_type,
			position, mtime)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
		ON CONFLICT (chunk_id) DO UPDATE SET
			document_id = EXCLUDED.document_id,
			user_id = EXCLUDED.user_id,
			content = EXCLUDED.content,
			embedding = EXCLUDED.embedding,
			token_count = EXCLUDED.token_count,
			chunk_type = EXCLUDED.chunk_type,
			position = EXCLUDED.position,
			mtime = EXCLUDED.mtime
	`
	tx, owned, err := beginOrJoin(ctx, r.db)
	if err != nil {
		return fmt.Errorf("repo: %w", err)
	}
	if owned {
		defer func() { _ = tx.Rollback() }()
	}

	stmt, err := tx.PrepareContext(ctx, query)
	if err != nil {
		return fmt.Errorf("repo: %w", err)
	}
	defer func() { _ = stmt.Close() }()

	for _, c := range chunks {
		if _, err := stmt.ExecContext(ctx, c.ChunkID, c.DocumentID, c.UserID, c.Content, pgvector.NewVector(c.Embedding),
			c.TokenCount, string(c.ChunkType), c.Position, c.Mtime); err != nil {
			return fmt.Errorf("exec: %w", err)
		}
	}
	if owned {
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit: %w", err)
		}
	}
	return nil
}

func (r *EmbeddingRepo) DeleteChunksByDocID(ctx context.Context, docID string) error {
	const query = `DELETE FROM chunk_embeddings WHERE document_id = $1`
	_, err := conn(ctx, r.db).ExecContext(ctx, query, docID)
	if err != nil {
		return fmt.Errorf("delete chunks by doc: %w", err)
	}
	return nil
}

type ChunkSearchResult struct {
	DocumentID string
	Score      float32
	ChunkType  model.ChunkType
}

func (
	r *EmbeddingRepo) SearchChunks(ctx context.Context,
	userID string,
	query []float32,
	threshold float32,
	topK int) ([]ChunkSearchResult,
	error,
) {
	queryStr := `
		SELECT document_id, (1 - (embedding <=> $2)) as score, chunk_type
		FROM chunk_embeddings
		WHERE user_id = $1 AND (1 - (embedding <=> $2)) >= $3
		ORDER BY embedding <=> $2
		LIMIT $4
	`
	rows, err := conn(ctx, r.db).QueryContext(ctx, queryStr, userID, pgvector.NewVector(query), threshold, topK)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()

	var results []ChunkSearchResult
	for rows.Next() {
		var res ChunkSearchResult
		var chunkType string
		if err := rows.Scan(&res.DocumentID, &res.Score, &chunkType); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		res.ChunkType = model.ChunkType(chunkType)
		results = append(results, res)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return results, nil
}

func (r *EmbeddingRepo) GetByDocID(ctx context.Context, docID string) (*model.DocumentEmbedding, error) {
	const query = `SELECT document_id, user_id, content_hash, mtime,
        embedding_status, attempts, next_retry_at, locked_until, last_error
        FROM document_embeddings WHERE document_id = $1`
	row := conn(ctx, r.db).QueryRowContext(ctx, query, docID)
	var item model.DocumentEmbedding
	var status string
	if err := row.Scan(
		&item.DocumentID, &item.UserID, &item.ContentHash, &item.Mtime,
		&status, &item.Attempts, &item.NextRetryAt, &item.LockedUntil, &item.LastError,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, appErr.ErrNotFound
		}
		return nil, fmt.Errorf("scan: %w", err)
	}
	item.EmbeddingStatus = model.EmbeddingStatus(status)
	return &item, nil
}

// ListStaleDocuments returns documents whose embedding work the queue
// should pick up. A row is considered work-ready when one of the following
// branches holds:
//
//  1. No embedding row exists at all (initial seed).
//  2. The embedding row is in a retryable status (pending or failed), its
//     backoff window has elapsed (next_retry_at <= now), and no other
//     worker currently holds the lease (locked_until < now). This branch
//     intentionally does NOT require content_hash to differ from the row,
//     because the save path writes the new content_hash together with
//     embedding_status='pending' in a single transaction: at that moment
//     documents.content_hash == document_embeddings.content_hash, and a
//     legacy `AND content_hash <> e.content_hash` predicate would silently
//     hide every freshly-saved document from the job.
//  3. The hashes diverge (e.g. a content write happened outside the save
//     transaction or upgrade migrations left them out of sync) AND no
//     other worker holds the lease. This branch covers drift recovery.
//
// Metadata-only updates (summary / tag / pin / star) never call
// UpsertPending and never touch content_hash, so they cannot trigger any
// of the three branches and remain correctly excluded.
//
// The order favors documents whose retry window opened earliest, falling
// back to oldest content_mtime, so retried failures do not starve fresh
// changes nor vice versa.
func (r *EmbeddingRepo) ListStaleDocuments(ctx context.Context, limit int, now int64) ([]model.Document, error) {
	return queryBasicDocuments(ctx, conn(ctx, r.db), listStaleDocumentsSQL, DocumentStateNormal, now, limit)
}

// listStaleDocumentsSQL is exposed at package scope so a sibling test can
// run regex assertions against the WHERE clause shape without re-stating
// the query and risking drift.
const listStaleDocumentsSQL = `
		SELECT d.id, d.user_id, d.title, d.content
		FROM documents d
		LEFT JOIN document_embeddings e ON d.id = e.document_id
		WHERE d.state = $1
		  AND (
				e.document_id IS NULL
				OR (
					e.embedding_status IN ('pending', 'failed')
					AND e.next_retry_at <= $2
					AND e.locked_until < $2
				)
				OR (
					d.content_hash <> e.content_hash
					AND e.locked_until < $2
				)
		  )
		ORDER BY COALESCE(e.next_retry_at, 0) ASC, d.content_mtime ASC, d.id ASC
		LIMIT $3
	`
