package repo

import (
	"context"
	"database/sql"

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
		INSERT INTO document_embeddings (document_id, user_id, embedding, content_hash, mtime)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (document_id) DO UPDATE SET
			user_id = EXCLUDED.user_id,
			embedding = EXCLUDED.embedding,
			content_hash = EXCLUDED.content_hash,
			mtime = EXCLUDED.mtime
	`
	_, err := r.db.ExecContext(ctx, query, emb.DocumentID, emb.UserID, pgvector.NewVector(emb.Embedding), emb.ContentHash, emb.Mtime)
	return err
}

func (r *EmbeddingRepo) ListByUser(ctx context.Context, userID string) ([]model.DocumentEmbedding, error) {
	const query = `SELECT document_id, user_id, embedding, content_hash, mtime FROM document_embeddings WHERE user_id = $1`
	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []model.DocumentEmbedding
	for rows.Next() {
		var item model.DocumentEmbedding
		var v pgvector.Vector
		if err := rows.Scan(&item.DocumentID, &item.UserID, &v, &item.ContentHash, &item.Mtime); err != nil {
			return nil, err
		}
		item.Embedding = v.Slice()
		results = append(results, item)
	}
	return results, nil
}

func (r *EmbeddingRepo) GetByDocID(ctx context.Context, docID string) (*model.DocumentEmbedding, error) {
	const query = `SELECT document_id, user_id, embedding, content_hash, mtime FROM document_embeddings WHERE document_id = $1`
	row := r.db.QueryRowContext(ctx, query, docID)
	var item model.DocumentEmbedding
	var v pgvector.Vector
	if err := row.Scan(&item.DocumentID, &item.UserID, &v, &item.ContentHash, &item.Mtime); err != nil {
		return nil, err
	}
	item.Embedding = v.Slice()
	return &item, nil
}

func (r *EmbeddingRepo) Search(ctx context.Context, userID string, query []float32, threshold float32, topK int) ([]string, error) {
	const queryStr = `
		SELECT document_id
		FROM document_embeddings
		WHERE user_id = $1 AND (1 - (embedding <=> $2)) >= $3
		ORDER BY embedding <=> $2
		LIMIT $4
	`
	rows, err := r.db.QueryContext(ctx, queryStr, userID, pgvector.NewVector(query), threshold, topK)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []string
	for rows.Next() {
		var docID string
		if err := rows.Scan(&docID); err != nil {
			return nil, err
		}
		result = append(result, docID)
	}
	return result, nil
}

func (r *EmbeddingRepo) ListStaleDocuments(ctx context.Context, limit int) ([]model.Document, error) {
	const query = `
		SELECT d.id, d.user_id, d.title, d.content 
		FROM documents d 
		LEFT JOIN document_embeddings e ON d.id = e.document_id 
		WHERE (e.document_id IS NULL OR d.mtime > e.mtime) AND d.state = $1
		LIMIT $2
	`
	rows, err := r.db.QueryContext(ctx, query, DocumentStateNormal, limit)
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
