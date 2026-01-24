package repo

import (
	"context"
	"database/sql"

	"github.com/didi/gendry/builder"

	"mnote/internal/model"
	appErr "mnote/internal/pkg/errors"
)

const (
	DocumentStateNormal  = 1
	DocumentStateDeleted = 2
)

type DocumentRepo struct {
	db *sql.DB
}

func NewDocumentRepo(db *sql.DB) *DocumentRepo {
	return &DocumentRepo{db: db}
}

func (r *DocumentRepo) Create(ctx context.Context, doc *model.Document) error {
	data := map[string]interface{}{
		"id":      doc.ID,
		"user_id": doc.UserID,
		"title":   doc.Title,
		"content": doc.Content,
		"state":   doc.State,
		"ctime":   doc.Ctime,
		"mtime":   doc.Mtime,
	}
	sqlStr, args, err := builder.BuildInsert("documents", []map[string]interface{}{data})
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, sqlStr, args...)
	return err
}

func (r *DocumentRepo) Update(ctx context.Context, doc *model.Document) error {
	where := map[string]interface{}{
		"id":      doc.ID,
		"user_id": doc.UserID,
		"state":   DocumentStateNormal,
	}
	update := map[string]interface{}{
		"title":   doc.Title,
		"content": doc.Content,
		"mtime":   doc.Mtime,
	}
	sqlStr, args, err := builder.BuildUpdate("documents", where, update)
	if err != nil {
		return err
	}
	result, err := r.db.ExecContext(ctx, sqlStr, args...)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return appErr.ErrNotFound
	}
	return nil
}

func (r *DocumentRepo) GetByID(ctx context.Context, userID, docID string) (*model.Document, error) {
	where := map[string]interface{}{
		"id":      docID,
		"user_id": userID,
		"state":   DocumentStateNormal,
	}
	sqlStr, args, err := builder.BuildSelect("documents", where, []string{"id", "user_id", "title", "content", "state", "ctime", "mtime"})
	if err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, appErr.ErrNotFound
	}
	var doc model.Document
	if err := rows.Scan(&doc.ID, &doc.UserID, &doc.Title, &doc.Content, &doc.State, &doc.Ctime, &doc.Mtime); err != nil {
		return nil, err
	}
	return &doc, nil
}

func (r *DocumentRepo) List(ctx context.Context, userID string, limit uint) ([]model.Document, error) {
	where := map[string]interface{}{
		"user_id":  userID,
		"state":    DocumentStateNormal,
		"_orderby": "mtime desc",
	}
	if limit > 0 {
		where["_limit"] = []uint{0, limit}
	}
	sqlStr, args, err := builder.BuildSelect("documents", where, []string{"id", "user_id", "title", "content", "state", "ctime", "mtime"})
	if err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	docs := make([]model.Document, 0)
	for rows.Next() {
		var doc model.Document
		if err := rows.Scan(&doc.ID, &doc.UserID, &doc.Title, &doc.Content, &doc.State, &doc.Ctime, &doc.Mtime); err != nil {
			return nil, err
		}
		docs = append(docs, doc)
	}
	return docs, rows.Err()
}

func (r *DocumentRepo) ListByIDs(ctx context.Context, userID string, docIDs []string) ([]model.Document, error) {
	if len(docIDs) == 0 {
		return []model.Document{}, nil
	}
	ids := make([]interface{}, 0, len(docIDs))
	for _, id := range docIDs {
		ids = append(ids, id)
	}
	where := map[string]interface{}{
		"user_id":     userID,
		"state":       DocumentStateNormal,
		"_custom_ids": builder.In{"id": ids},
	}
	sqlStr, args, err := builder.BuildSelect("documents", where, []string{"id", "user_id", "title", "content", "state", "ctime", "mtime"})
	if err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	docs := make([]model.Document, 0)
	for rows.Next() {
		var doc model.Document
		if err := rows.Scan(&doc.ID, &doc.UserID, &doc.Title, &doc.Content, &doc.State, &doc.Ctime, &doc.Mtime); err != nil {
			return nil, err
		}
		docs = append(docs, doc)
	}
	return docs, rows.Err()
}

func (r *DocumentRepo) Delete(ctx context.Context, userID, docID string, mtime int64) error {
	where := map[string]interface{}{
		"id":      docID,
		"user_id": userID,
		"state":   DocumentStateNormal,
	}
	update := map[string]interface{}{
		"state": DocumentStateDeleted,
		"mtime": mtime,
	}
	sqlStr, args, err := builder.BuildUpdate("documents", where, update)
	if err != nil {
		return err
	}
	result, err := r.db.ExecContext(ctx, sqlStr, args...)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return appErr.ErrNotFound
	}
	return nil
}
