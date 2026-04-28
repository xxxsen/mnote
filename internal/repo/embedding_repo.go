package repo

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/pgvector/pgvector-go"

	"github.com/xxxsen/mnote/internal/model"
)

type EmbeddingRepo struct {
	db *sql.DB
}

func NewEmbeddingRepo(db *sql.DB) *EmbeddingRepo {
	return &EmbeddingRepo{db: db}
}

func (r *EmbeddingRepo) Save(ctx context.Context, emb *model.DocumentEmbedding) error {
	const query = `
		INSERT INTO document_embeddings (document_id, user_id, content_hash, mtime)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (document_id) DO UPDATE SET
			user_id = EXCLUDED.user_id,
			content_hash = EXCLUDED.content_hash,
			mtime = EXCLUDED.mtime
	`
	_, err := conn(ctx, r.db).ExecContext(ctx, query, emb.DocumentID, emb.UserID, emb.ContentHash, emb.Mtime)
	if err != nil {
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
	const query = `SELECT document_id, user_id, content_hash, mtime FROM document_embeddings WHERE document_id = $1`
	row := conn(ctx, r.db).QueryRowContext(ctx, query, docID)
	var item model.DocumentEmbedding
	if err := row.Scan(&item.DocumentID, &item.UserID, &item.ContentHash, &item.Mtime); err != nil {
		return nil, fmt.Errorf("scan: %w", err)
	}
	return &item, nil
}

func (r *EmbeddingRepo) ListStaleDocuments(ctx context.Context, limit int, maxMtime int64) ([]model.Document, error) {
	const q = `
		SELECT d.id, d.user_id, d.title, d.content 
		FROM documents d 
		LEFT JOIN document_embeddings e ON d.id = e.document_id 
		WHERE (e.document_id IS NULL OR d.mtime > e.mtime) AND d.state = $1 AND d.mtime < $2
		LIMIT $3
	`
	return queryBasicDocuments(ctx, conn(ctx, r.db), q, DocumentStateNormal, maxMtime, limit)
}
