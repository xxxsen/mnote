package repo

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"

	"github.com/didi/gendry/builder"
	"github.com/xxxsen/mnote/internal/model"
)

type EmbeddingRepo struct {
	db *sql.DB
}

func NewEmbeddingRepo(db *sql.DB) *EmbeddingRepo {
	return &EmbeddingRepo{db: db}
}

func (r *EmbeddingRepo) Save(ctx context.Context, emb *model.DocumentEmbedding) error {
	blob, err := json.Marshal(emb.Embedding)
	if err != nil {
		return err
	}
	data := map[string]interface{}{
		"document_id":  emb.DocumentID,
		"user_id":      emb.UserID,
		"embedding":    blob,
		"content_hash": emb.ContentHash,
		"mtime":        emb.Mtime,
	}
	sqlStr, args, err := builder.BuildInsert("document_embeddings", []map[string]interface{}{data})
	if err != nil {
		return err
	}
	sqlStr = strings.Replace(sqlStr, "INSERT INTO", "INSERT OR REPLACE INTO", 1)
	_, err = r.db.ExecContext(ctx, sqlStr, args...)
	return err
}

func (r *EmbeddingRepo) ListByUser(ctx context.Context, userID string) ([]model.DocumentEmbedding, error) {
	where := map[string]interface{}{
		"user_id": userID,
	}
	sqlStr, args, err := builder.BuildSelect("document_embeddings", where, []string{"document_id", "user_id", "embedding", "content_hash", "mtime"})
	if err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var results []model.DocumentEmbedding
	for rows.Next() {
		var item model.DocumentEmbedding
		var blob []byte
		if err := rows.Scan(&item.DocumentID, &item.UserID, &blob, &item.ContentHash, &item.Mtime); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(blob, &item.Embedding); err != nil {
			return nil, err
		}
		results = append(results, item)
	}
	return results, nil
}

func (r *EmbeddingRepo) GetByDocID(ctx context.Context, docID string) (*model.DocumentEmbedding, error) {
	where := map[string]interface{}{
		"document_id": docID,
	}
	sqlStr, args, err := builder.BuildSelect("document_embeddings", where, []string{"document_id", "user_id", "embedding", "content_hash", "mtime"})
	if err != nil {
		return nil, err
	}
	row := r.db.QueryRowContext(ctx, sqlStr, args...)
	var item model.DocumentEmbedding
	var blob []byte
	if err := row.Scan(&item.DocumentID, &item.UserID, &blob, &item.ContentHash, &item.Mtime); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(blob, &item.Embedding); err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *EmbeddingRepo) ListStaleDocuments(ctx context.Context, limit int) ([]model.Document, error) {
	const query = `
		SELECT d.id, d.user_id, d.title, d.content 
		FROM documents d 
		LEFT JOIN document_embeddings e ON d.id = e.document_id 
		WHERE (e.document_id IS NULL OR d.mtime > e.mtime) AND d.state = ?
		LIMIT ?
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
