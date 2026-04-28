package repo

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

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
	data := map[string]any{
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
	sqlStr, args, err := builder.BuildInsert("documents", []map[string]any{data})
	if err != nil {
		return fmt.Errorf("build insert: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	_, err = conn(ctx, r.db).ExecContext(ctx, sqlStr, args...)
	if err != nil {
		if dbutil.IsConflict(err) {
			return appErr.ErrConflict
		}
		return fmt.Errorf("exec: %w", err)
	}
	return nil
}

func (r *DocumentRepo) Update(ctx context.Context, doc *model.Document) error {
	where := map[string]any{
		"id":      doc.ID,
		"user_id": doc.UserID,
		"state":   DocumentStateNormal,
	}
	update := map[string]any{
		"title":   doc.Title,
		"content": doc.Content,
		"mtime":   doc.Mtime,
	}
	sqlStr, args, err := builder.BuildUpdate("documents", where, update)
	if err != nil {
		return fmt.Errorf("build update: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	result, err := conn(ctx, r.db).ExecContext(ctx, sqlStr, args...)
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	if affected == 0 {
		return appErr.ErrNotFound
	}
	return nil
}

func (r *DocumentRepo) updateDocField(ctx context.Context, userID, docID string, update map[string]any) error {
	where := map[string]any{
		"id":      docID,
		"user_id": userID,
		"state":   DocumentStateNormal,
	}
	sqlStr, args, err := builder.BuildUpdate("documents", where, update)
	if err != nil {
		return fmt.Errorf("build update: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	result, err := conn(ctx, r.db).ExecContext(ctx, sqlStr, args...)
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	if affected == 0 {
		return appErr.ErrNotFound
	}
	return nil
}

func (r *DocumentRepo) TouchMtime(ctx context.Context, userID, docID string, mtime int64) error {
	return r.updateDocField(ctx, userID, docID, map[string]any{"mtime": mtime})
}

func (r *DocumentRepo) UpdatePinned(ctx context.Context, userID, docID string, pinned int) error {
	return r.updateDocField(ctx, userID, docID, map[string]any{"pinned": pinned})
}

func (r *DocumentRepo) UpdateStarred(ctx context.Context, userID, docID string, starred int) error {
	return r.updateDocField(ctx, userID, docID, map[string]any{"starred": starred})
}

func (r *DocumentRepo) GetByID(ctx context.Context, userID, docID string) (*model.Document, error) {
	where := map[string]any{
		"id":      docID,
		"user_id": userID,
		"state":   DocumentStateNormal,
	}
	sqlStr, args, err := builder.BuildSelect("documents", where, []string{
		"id", "user_id", "title", "content",
		"state", "pinned", "starred", "ctime", "mtime",
	})
	if err != nil {
		return nil, fmt.Errorf("build select: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := conn(ctx, r.db).QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, fmt.Errorf("query: %w", err)
		}
		return nil, appErr.ErrNotFound
	}
	var doc model.Document
	if err := rows.Scan(&doc.ID, &doc.UserID, &doc.Title, &doc.Content, &doc.State, &doc.Pinned, &doc.Starred,
		&doc.Ctime, &doc.Mtime); err != nil {
		return nil, fmt.Errorf("scan: %w", err)
	}
	return &doc, nil
}

func (r *DocumentRepo) GetByTitle(ctx context.Context, userID, title string) (*model.Document, error) {
	where := map[string]any{
		"user_id":  userID,
		"title":    title,
		"state":    DocumentStateNormal,
		"_orderby": "mtime desc",
		"_limit":   []uint{0, 1},
	}
	sqlStr, args, err := builder.BuildSelect("documents", where, []string{
		"id", "user_id", "title", "content",
		"state", "pinned", "starred", "ctime", "mtime",
	})
	if err != nil {
		return nil, fmt.Errorf("build select: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := conn(ctx, r.db).QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return nil, fmt.Errorf("query: %w", err)
		}
		return nil, appErr.ErrNotFound
	}
	var doc model.Document
	if err := rows.Scan(&doc.ID, &doc.UserID, &doc.Title, &doc.Content, &doc.State, &doc.Pinned, &doc.Starred,
		&doc.Ctime, &doc.Mtime); err != nil {
		return nil, fmt.Errorf("scan: %w", err)
	}
	return &doc, nil
}

func (
	r *DocumentRepo) List(ctx context.Context,
	userID string,
	starred *int,
	limit,
	offset uint,
	orderBy string) ([]model.Document,
	error,
) {
	where := map[string]any{
		"user_id": userID,
		"state":   DocumentStateNormal,
	}
	if starred != nil {
		where["starred"] = *starred
	}
	if orderBy == "" {
		orderBy = "pinned desc, ctime desc, id asc"
	} else if !strings.Contains(orderBy, "id") {
		orderBy += ", id asc"
	}
	where["_orderby"] = orderBy
	if limit > 0 {
		where["_limit"] = []uint{offset, limit}
	}
	sqlStr, args, err := builder.BuildSelect("documents", where, []string{
		"id", "user_id", "title", "content",
		"state", "pinned", "starred", "ctime", "mtime",
	})
	if err != nil {
		return nil, fmt.Errorf("build select: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := conn(ctx, r.db).QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	docs := make([]model.Document, 0)
	for rows.Next() {
		var doc model.Document
		if err := rows.Scan(&doc.ID, &doc.UserID, &doc.Title, &doc.Content, &doc.State, &doc.Pinned, &doc.Starred,
			&doc.Ctime, &doc.Mtime); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		docs = append(docs, doc)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return docs, nil
}

func (r *DocumentRepo) ListByIDs(ctx context.Context, userID string, docIDs []string) ([]model.Document, error) {
	if len(docIDs) == 0 {
		return []model.Document{}, nil
	}
	ids := make([]any, 0, len(docIDs))
	for _, id := range docIDs {
		ids = append(ids, id)
	}
	where := map[string]any{
		"user_id":     userID,
		"state":       DocumentStateNormal,
		"_custom_ids": builder.In{"id": ids},
		"_orderby":    "pinned desc, ctime desc",
	}
	sqlStr, args, err := builder.BuildSelect("documents", where, []string{
		"id", "user_id", "title", "content",
		"state", "pinned", "starred", "ctime", "mtime",
	})
	if err != nil {
		return nil, fmt.Errorf("build select: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := conn(ctx, r.db).QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	docs := make([]model.Document, 0)
	for rows.Next() {
		var doc model.Document
		if err := rows.Scan(&doc.ID, &doc.UserID, &doc.Title, &doc.Content, &doc.State, &doc.Pinned, &doc.Starred,
			&doc.Ctime, &doc.Mtime); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		docs = append(docs, doc)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return docs, nil
}

func (r *DocumentRepo) Count(ctx context.Context, userID string, starred *int) (int, error) {
	query := "SELECT COUNT(1) FROM documents WHERE user_id = ? AND state = ?"
	args := []any{userID, DocumentStateNormal}
	if starred != nil {
		query += " AND starred = ?"
		args = append(args, *starred)
	}
	query, args = dbutil.Finalize(query, args)
	row := conn(ctx, r.db).QueryRowContext(ctx, query, args...)
	var count int
	if err := row.Scan(&count); err != nil {
		return 0, fmt.Errorf("scan: %w", err)
	}
	return count, nil
}

func (
	r *DocumentRepo) SearchLike(ctx context.Context,
	userID,
	query,
	tagID string,
	starred *int,
	limit,
	offset uint,
	orderBy string) ([]model.Document,
	error,
) {
	like := "%" + query + "%"
	where := map[string]any{
		"user_id": userID,
		"state":   DocumentStateNormal,
	}
	if orderBy == "" {
		orderBy = "mtime desc, id asc"
	} else if !strings.Contains(orderBy, "id") {
		orderBy += ", id asc"
	}
	where["_orderby"] = orderBy
	if query != "" {
		where["_custom_search"] = builder.Custom("(title LIKE ? OR content LIKE ?)", like, like)
	}
	if tagID != "" {
		where["_custom_tag"] = builder.Custom(
			"id IN (SELECT document_id FROM document_tags WHERE tag_id = ? AND user_id = ?)",
			tagID, userID,
		)
	}
	if starred != nil {
		where["starred"] = *starred
	}
	if limit > 0 {
		where["_limit"] = []uint{offset, limit}
	}
	sqlStr, args, err := builder.BuildSelect("documents", where, []string{
		"id", "user_id", "title", "content",
		"state", "pinned", "starred", "ctime", "mtime",
	})
	if err != nil {
		return nil, fmt.Errorf("build select: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := conn(ctx, r.db).QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	docs := make([]model.Document, 0)
	for rows.Next() {
		var doc model.Document
		if err := rows.Scan(&doc.ID, &doc.UserID, &doc.Title, &doc.Content, &doc.State, &doc.Pinned, &doc.Starred,
			&doc.Ctime, &doc.Mtime); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		docs = append(docs, doc)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return docs, nil
}

func (r *DocumentRepo) Delete(ctx context.Context, userID, docID string, mtime int64) error {
	where := map[string]any{
		"id":      docID,
		"user_id": userID,
		"state":   DocumentStateNormal,
	}
	update := map[string]any{
		"state": DocumentStateDeleted,
		"mtime": mtime,
	}
	sqlStr, args, err := builder.BuildUpdate("documents", where, update)
	if err != nil {
		return fmt.Errorf("build update: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	result, err := conn(ctx, r.db).ExecContext(ctx, sqlStr, args...)
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	if affected == 0 {
		return appErr.ErrNotFound
	}
	return nil
}

func (
	r *DocumentRepo) UpdateLinks(ctx context.Context,
	userID,
	sourceID string,
	targetIDs []string,
	mtime int64,
) error {
	tx, owned, err := beginOrJoin(ctx, r.db)
	if err != nil {
		return fmt.Errorf("repo: %w", err)
	}
	if owned {
		defer func() { _ = tx.Rollback() }()
	}

	delSQL, delArgs, err := builder.BuildDelete("document_links", map[string]any{
		"source_id": sourceID,
		"user_id":   userID,
	})
	if err != nil {
		return fmt.Errorf("build delete: %w", err)
	}
	delSQL, delArgs = dbutil.Finalize(delSQL, delArgs)
	if _, err := tx.ExecContext(ctx, delSQL, delArgs...); err != nil {
		return fmt.Errorf("exec: %w", err)
	}

	inserts := buildLinkInserts(sourceID, userID, targetIDs, mtime)
	if len(inserts) > 0 {
		insertSQL, insertArgs, err := builder.BuildInsert("document_links", inserts)
		if err != nil {
			return fmt.Errorf("build insert: %w", err)
		}
		insertSQL, insertArgs = dbutil.Finalize(insertSQL, insertArgs)
		if _, err := tx.ExecContext(ctx, insertSQL, insertArgs...); err != nil {
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

func (r *DocumentRepo) GetBacklinks(ctx context.Context, userID, targetID string) ([]model.Document, error) {
	// Find all normal state documents whose ID is in the subquery of document_links
	where := map[string]any{
		"user_id": userID,
		"state":   DocumentStateNormal,
		"_custom_links": builder.Custom(
			"id IN (SELECT source_id FROM document_links WHERE target_id = ? AND user_id = ?)",
			targetID, userID,
		),
		"_orderby": "mtime desc",
	}

	sqlStr, args, err := builder.BuildSelect("documents", where, []string{
		"id", "user_id", "title", "content",
		"state", "pinned", "starred", "ctime", "mtime",
	})
	if err != nil {
		return nil, fmt.Errorf("build select: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := conn(ctx, r.db).QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()

	docs := make([]model.Document, 0)
	for rows.Next() {
		var doc model.Document
		if err := rows.Scan(&doc.ID, &doc.UserID, &doc.Title, &doc.Content, &doc.State, &doc.Pinned, &doc.Starred,
			&doc.Ctime, &doc.Mtime); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		docs = append(docs, doc)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return docs, nil
}

func buildLinkInserts(sourceID, userID string, targetIDs []string, mtime int64) []map[string]any {
	seen := make(map[string]bool)
	var inserts []map[string]any
	for _, targetID := range targetIDs {
		if seen[targetID] || targetID == sourceID {
			continue
		}
		seen[targetID] = true
		inserts = append(inserts, map[string]any{
			"source_id": sourceID,
			"target_id": targetID,
			"user_id":   userID,
			"ctime":     mtime,
		})
	}
	return inserts
}
