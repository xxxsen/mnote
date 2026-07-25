package repo

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/pgvector/pgvector-go"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/dochash"
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
// it up. It clears all transient retry/error fields. The save transaction is
// authoritative and must always re-pend after a content change.
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

// upsertPendingIfHashChangedSQL is package-scoped so tests can guard the
// conflict predicate without duplicating the production query.
const upsertPendingIfHashChangedSQL = `
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
	WHERE document_embeddings.content_hash <> EXCLUDED.content_hash
`

// upsertPendingIfHashChanged re-pends an embedding row only while it still
// represents older content. If another worker has already moved the row to
// the current hash, its state and lease are authoritative.
func (r *EmbeddingRepo) upsertPendingIfHashChanged(
	ctx context.Context, docID, userID, contentHash string, contentMtime int64,
) error {
	_, err := conn(ctx, r.db).ExecContext(
		ctx, upsertPendingIfHashChangedSQL, docID, userID, contentHash, contentMtime,
	)
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

// Claim atomically claims new/retry work or recovers a running row whose
// worker lease expired. The state/lease update happens in one statement so
// two concurrent workers cannot both win.
func (r *EmbeddingRepo) Claim(
	ctx context.Context, docID string, lockedUntil, now int64,
) (bool, error) {
	const query = `
		UPDATE document_embeddings
		SET embedding_status = 'running',
			locked_until = $2
		WHERE document_id = $1
			AND locked_until < $3
			AND (
				(
					embedding_status IN ('pending', 'failed')
					AND next_retry_at <= $3
				)
				OR embedding_status = 'running'
			)
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

// ClaimDrift atomically promotes a succeeded row whose embedding hash differs
// from the current documents hash. documentHash must be the snapshot returned
// by ListStaleDocuments. Rechecking that snapshot in the UPDATE prevents an
// obsolete scan result from demoting a newer succeeded row, while still
// allowing legacy documents.content_hash drift to be repaired.
func (r *EmbeddingRepo) ClaimDrift(
	ctx context.Context, docID, documentHash string, lockedUntil, now int64,
) (bool, error) {
	const query = `
		UPDATE document_embeddings AS e
		SET embedding_status = 'running',
			locked_until = $2
		FROM documents AS d
		WHERE e.document_id = $1
			AND d.id = e.document_id
			AND d.state = $5
			AND d.content_hash = $4
			AND e.embedding_status = 'succeeded'
			AND e.content_hash <> d.content_hash
			AND e.locked_until < $3
	`
	res, err := conn(ctx, r.db).ExecContext(
		ctx, query, docID, lockedUntil, now, documentHash, DocumentStateNormal,
	)
	if err != nil {
		return false, fmt.Errorf("exec: %w", err)
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("rows affected: %w", err)
	}
	return affected > 0, nil
}

// ResetLeaseToPending zeros the worker lease and switches embedding_status
// back to 'pending' without touching the row's content_hash / mtime. The
// rate-limit cool-down path uses this so a transient 429 cannot wipe out
// the row's currently-valid hash by feeding empty strings through the
// generic UpsertPending update.
func (r *EmbeddingRepo) ResetLeaseToPending(ctx context.Context, docID string) error {
	const query = `
		UPDATE document_embeddings
		SET embedding_status = 'pending',
			locked_until = 0,
			next_retry_at = 0
		WHERE document_id = $1
	`
	if _, err := conn(ctx, r.db).ExecContext(ctx, query, docID); err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	return nil
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
//  3. A running row's lease has expired, so work abandoned by a crashed
//     worker can be claimed again.
//  4. The hashes diverge AND the embedding row is in the terminal
//     'succeeded' state AND no other worker holds the lease. This is the
//     drift-recovery branch: it must be restricted to 'succeeded' rows
//     because Claim and ClaimDrift partition the state machine — Claim
//     covers pending/failed (retry window controlled by next_retry_at)
//     and ClaimDrift covers succeeded-but-drifted rows. Without the
//     status guard, a failed row whose retry window has not yet opened
//     would be re-listed every scan but neither Claim (next_retry_at >
//     now) nor ClaimDrift (status != 'succeeded') would match, leaving
//     the worker in a candidate-but-cannot-process spin loop.
//
// Metadata-only updates (tag / pin / star) never call
// UpsertPending and never touch content_hash, so they cannot trigger any
// of these branches and remain correctly excluded.
//
// The order favors documents whose retry window opened earliest, falling
// back to oldest content_mtime, so retried failures do not starve fresh
// changes nor vice versa.
//
// The SELECT carries content_hash and content_mtime in addition to the
// minimal id/user_id/title/content set so that the worker can echo the
// expected hash into CompleteEmbeddingIfCurrent without re-reading the
// documents row. Carrying the hash here is what closes the lost-update
// window described on the completion path: between scan and completion
// the document may have been re-saved, and the completion call only
// commits chunks when the locked row's hash still equals this snapshot.
func (r *EmbeddingRepo) ListStaleDocuments(ctx context.Context, limit int, now int64) ([]model.Document, error) {
	rows, err := conn(ctx, r.db).QueryContext(ctx, listStaleDocumentsSQL, DocumentStateNormal, now, limit)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	var docs []model.Document
	for rows.Next() {
		var doc model.Document
		if err := rows.Scan(
			&doc.ID, &doc.UserID, &doc.Title, &doc.Content,
			&doc.ContentHash, &doc.ContentMtime,
		); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		docs = append(docs, doc)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return docs, nil
}

// listStaleDocumentsSQL is exposed at package scope so a sibling test can
// run regex assertions against the WHERE clause shape without re-stating
// the query and risking drift.
const listStaleDocumentsSQL = `
		SELECT d.id, d.user_id, d.title, d.content, d.content_hash, d.content_mtime
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
					e.embedding_status = 'running'
					AND e.locked_until < $2
				)
				OR (
					e.embedding_status = 'succeeded'
					AND d.content_hash <> e.content_hash
					AND e.locked_until < $2
				)
		  )
		ORDER BY COALESCE(e.next_retry_at, 0) ASC, d.content_mtime ASC, d.id ASC
		LIMIT $3
	`

// CompleteEmbeddingIfCurrent finalizes an embedding work item under a
// SELECT ... FOR UPDATE lock on the documents row. The caller passes the
// expectedHash it computed from the worker's snapshot together with the
// chunks it produced; this method only commits those chunks when the
// locked row still hashes to that expected value. Otherwise the document
// has moved on since the snapshot was taken and any write here would
// silently demote the live content back to the snapshot's body.
//
// Behavior is binary:
//
//   - Locked row still hashes to expectedHash: replace chunks, mark the
//     document_embeddings row as 'succeeded' with the recomputed hash,
//     and normalize documents.content_hash to the same value. The hash
//     normalisation is a no-op when both sides already match, and
//     repairs legacy rows that 008's backfill could not reach. Returns
//     (true, nil).
//   - Locked row hashes to something else: do NOT touch chunks, do NOT
//     overwrite either content_hash column, and re-pend the embedding
//     row for the current hash so the next scan can pick it up cleanly
//     (the save path also calls UpsertPending, but a worker that
//     successfully Claim()-ed before the save committed may have left
//     the row in 'running'). The conditional re-pend only changes a row
//     whose hash is still old; a newer row for the current hash keeps its
//     state and lease. Returns (false, nil).
//
// All writes happen inside a single transaction. When the caller already
// runs in a transaction (via WithTx) the existing tx is joined; otherwise
// a fresh tx is begun and committed on success.
func (r *EmbeddingRepo) CompleteEmbeddingIfCurrent(
	ctx context.Context,
	userID, docID, expectedHash string,
	chunks []*model.ChunkEmbedding,
	now int64,
) (bool, error) {
	var applied bool
	err := RunInTx(ctx, r.db, func(txCtx context.Context) error {
		var title, content string
		var contentMtime int64
		row := conn(txCtx, r.db).QueryRowContext(txCtx, `
			SELECT title, content, content_mtime
			FROM documents
			WHERE id = $1 AND user_id = $2 AND state = $3
			FOR UPDATE
		`, docID, userID, DocumentStateNormal)
		if scanErr := row.Scan(&title, &content, &contentMtime); scanErr != nil {
			if errors.Is(scanErr, sql.ErrNoRows) {
				return appErr.ErrNotFound
			}
			return fmt.Errorf("lock document: %w", scanErr)
		}
		currentHash := dochash.Compute(title, content)
		if currentHash != expectedHash {
			if err := r.upsertPendingIfHashChanged(
				txCtx, docID, userID, currentHash, contentMtime,
			); err != nil {
				return fmt.Errorf("re-pend stale embedding: %w", err)
			}
			applied = false
			return nil
		}
		if err := r.DeleteChunksByDocID(txCtx, docID); err != nil {
			return fmt.Errorf("delete chunks: %w", err)
		}
		if err := r.SaveChunks(txCtx, chunks); err != nil {
			return fmt.Errorf("save chunks: %w", err)
		}
		if err := r.Save(txCtx, &model.DocumentEmbedding{
			DocumentID:  docID,
			UserID:      userID,
			ContentHash: currentHash,
			Mtime:       now,
		}); err != nil {
			return fmt.Errorf("save embedding: %w", err)
		}
		if _, err := conn(txCtx, r.db).ExecContext(txCtx,
			`UPDATE documents SET content_hash = $2 WHERE id = $1`,
			docID, currentHash,
		); err != nil {
			return fmt.Errorf("normalize content hash: %w", err)
		}
		applied = true
		return nil
	})
	if err != nil {
		return false, err
	}
	return applied, nil
}
