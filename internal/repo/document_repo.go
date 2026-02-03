package repo

import (
	"context"
	"database/sql"

	"github.com/didi/gendry/builder"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/dbutil"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
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
		"pinned":  doc.Pinned,
		"starred": doc.Starred,
		"ctime":   doc.Ctime,
		"mtime":   doc.Mtime,
	}
	sqlStr, args, err := builder.BuildInsert("documents", []map[string]interface{}{data})
	if err != nil {
		return err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	_, err = r.db.ExecContext(ctx, sqlStr, args...)
	if err != nil {
		if dbutil.IsConflict(err) {
			return appErr.ErrConflict
		}
		return err
	}
	return nil
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
	sqlStr, args = dbutil.Finalize(sqlStr, args)
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

func (r *DocumentRepo) TouchMtime(ctx context.Context, userID, docID string, mtime int64) error {
	where := map[string]interface{}{
		"id":      docID,
		"user_id": userID,
		"state":   DocumentStateNormal,
	}
	update := map[string]interface{}{
		"mtime": mtime,
	}
	sqlStr, args, err := builder.BuildUpdate("documents", where, update)
	if err != nil {
		return err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
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

func (r *DocumentRepo) UpdatePinned(ctx context.Context, userID, docID string, pinned int) error {
	where := map[string]interface{}{
		"id":      docID,
		"user_id": userID,
		"state":   DocumentStateNormal,
	}
	update := map[string]interface{}{
		"pinned": pinned,
	}
	sqlStr, args, err := builder.BuildUpdate("documents", where, update)
	if err != nil {
		return err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
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

func (r *DocumentRepo) UpdateStarred(ctx context.Context, userID, docID string, starred int) error {
	where := map[string]interface{}{
		"id":      docID,
		"user_id": userID,
		"state":   DocumentStateNormal,
	}
	update := map[string]interface{}{
		"starred": starred,
	}
	sqlStr, args, err := builder.BuildUpdate("documents", where, update)
	if err != nil {
		return err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
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
	sqlStr, args, err := builder.BuildSelect("documents", where, []string{"id", "user_id", "title", "content", "state", "pinned", "starred", "ctime", "mtime"})
	if err != nil {
		return nil, err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, appErr.ErrNotFound
	}
	var doc model.Document
	if err := rows.Scan(&doc.ID, &doc.UserID, &doc.Title, &doc.Content, &doc.State, &doc.Pinned, &doc.Starred, &doc.Ctime, &doc.Mtime); err != nil {
		return nil, err
	}
	return &doc, nil
}

func (r *DocumentRepo) GetByTitle(ctx context.Context, userID, title string) (*model.Document, error) {
	where := map[string]interface{}{
		"user_id":  userID,
		"title":    title,
		"state":    DocumentStateNormal,
		"_orderby": "mtime desc",
		"_limit":   []uint{0, 1},
	}
	sqlStr, args, err := builder.BuildSelect("documents", where, []string{"id", "user_id", "title", "content", "state", "pinned", "starred", "ctime", "mtime"})
	if err != nil {
		return nil, err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, appErr.ErrNotFound
	}
	var doc model.Document
	if err := rows.Scan(&doc.ID, &doc.UserID, &doc.Title, &doc.Content, &doc.State, &doc.Pinned, &doc.Starred, &doc.Ctime, &doc.Mtime); err != nil {
		return nil, err
	}
	return &doc, nil
}

func (r *DocumentRepo) List(ctx context.Context, userID string, starred *int, limit, offset uint, orderBy string) ([]model.Document, error) {
	where := map[string]interface{}{
		"user_id": userID,
		"state":   DocumentStateNormal,
	}
	if starred != nil {
		where["starred"] = *starred
	}
	if orderBy == "" {
		orderBy = "pinned desc, ctime desc"
	}
	where["_orderby"] = orderBy
	if limit > 0 {
		where["_limit"] = []uint{offset, limit}
	}
	sqlStr, args, err := builder.BuildSelect("documents", where, []string{"id", "user_id", "title", "content", "state", "pinned", "starred", "ctime", "mtime"})
	if err != nil {
		return nil, err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	docs := make([]model.Document, 0)
	for rows.Next() {
		var doc model.Document
		if err := rows.Scan(&doc.ID, &doc.UserID, &doc.Title, &doc.Content, &doc.State, &doc.Pinned, &doc.Starred, &doc.Ctime, &doc.Mtime); err != nil {
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
		"_orderby":    "pinned desc, ctime desc",
	}
	sqlStr, args, err := builder.BuildSelect("documents", where, []string{"id", "user_id", "title", "content", "state", "pinned", "starred", "ctime", "mtime"})
	if err != nil {
		return nil, err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	docs := make([]model.Document, 0)
	for rows.Next() {
		var doc model.Document
		if err := rows.Scan(&doc.ID, &doc.UserID, &doc.Title, &doc.Content, &doc.State, &doc.Pinned, &doc.Starred, &doc.Ctime, &doc.Mtime); err != nil {
			return nil, err
		}
		docs = append(docs, doc)
	}
	return docs, rows.Err()
}

func (r *DocumentRepo) Count(ctx context.Context, userID string, starred *int) (int, error) {
	query := "SELECT COUNT(1) FROM documents WHERE user_id = ? AND state = ?"
	args := []interface{}{userID, DocumentStateNormal}
	if starred != nil {
		query += " AND starred = ?"
		args = append(args, *starred)
	}
	query, args = dbutil.Finalize(query, args)
	row := r.db.QueryRowContext(ctx, query, args...)
	var count int
	if err := row.Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func (r *DocumentRepo) SearchLike(ctx context.Context, userID, query, tagID string, starred *int, limit, offset uint, orderBy string) ([]model.Document, error) {
	like := "%" + query + "%"
	where := map[string]interface{}{
		"user_id": userID,
		"state":   DocumentStateNormal,
	}
	if orderBy == "" {
		orderBy = "mtime desc"
	}
	where["_orderby"] = orderBy
	if query != "" {
		where["_custom_search"] = builder.Custom("(title LIKE ? OR content LIKE ?)", like, like)
	}
	if tagID != "" {
		where["_custom_tag"] = builder.Custom("id IN (SELECT document_id FROM document_tags WHERE tag_id = ? AND user_id = ?)", tagID, userID)
	}
	if starred != nil {
		where["starred"] = *starred
	}
	if limit > 0 {
		where["_limit"] = []uint{offset, limit}
	}
	sqlStr, args, err := builder.BuildSelect("documents", where, []string{"id", "user_id", "title", "content", "state", "pinned", "starred", "ctime", "mtime"})
	if err != nil {
		return nil, err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	docs := make([]model.Document, 0)
	for rows.Next() {
		var doc model.Document
		if err := rows.Scan(&doc.ID, &doc.UserID, &doc.Title, &doc.Content, &doc.State, &doc.Pinned, &doc.Starred, &doc.Ctime, &doc.Mtime); err != nil {
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
	sqlStr, args = dbutil.Finalize(sqlStr, args)
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
