package repo

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/didi/gendry/builder"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/dbutil"
)

type DocumentTagRepo struct {
	db *sql.DB
}

func NewDocumentTagRepo(db *sql.DB) *DocumentTagRepo {
	return &DocumentTagRepo{db: db}
}

func (r *DocumentTagRepo) Add(ctx context.Context, docTag *model.DocumentTag) error {
	data := map[string]any{
		"user_id":     docTag.UserID,
		"document_id": docTag.DocumentID,
		"tag_id":      docTag.TagID,
	}
	sqlStr, args, err := builder.BuildInsert("document_tags", []map[string]any{data})
	if err != nil {
		return fmt.Errorf("build insert: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	if _, err = conn(ctx, r.db).ExecContext(ctx, sqlStr, args...); err != nil {
		return fmt.Errorf("insert document tag: %w", err)
	}
	return nil
}

func (r *DocumentTagRepo) DeleteByDoc(ctx context.Context, userID, docID string) error {
	where := map[string]any{"user_id": userID, "document_id": docID}
	sqlStr, args, err := builder.BuildDelete("document_tags", where)
	if err != nil {
		return fmt.Errorf("build delete: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	if _, err = conn(ctx, r.db).ExecContext(ctx, sqlStr, args...); err != nil {
		return fmt.Errorf("delete tags by doc: %w", err)
	}
	return nil
}

func (r *DocumentTagRepo) DeleteByTag(ctx context.Context, userID, tagID string) error {
	where := map[string]any{"user_id": userID, "tag_id": tagID}
	sqlStr, args, err := builder.BuildDelete("document_tags", where)
	if err != nil {
		return fmt.Errorf("build delete: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	if _, err = conn(ctx, r.db).ExecContext(ctx, sqlStr, args...); err != nil {
		return fmt.Errorf("delete tags by tag: %w", err)
	}
	return nil
}

func (r *DocumentTagRepo) queryStringColumn(
	ctx context.Context, where map[string]any, col string,
) ([]string, error) {
	sqlStr, args, err := builder.BuildSelect("document_tags", where, []string{col})
	if err != nil {
		return nil, fmt.Errorf("build select: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := conn(ctx, r.db).QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	result := make([]string, 0)
	for rows.Next() {
		var val string
		if err := rows.Scan(&val); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		result = append(result, val)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return result, nil
}

func (r *DocumentTagRepo) ListTagIDs(ctx context.Context, userID, docID string) ([]string, error) {
	return r.queryStringColumn(ctx, map[string]any{"user_id": userID, "document_id": docID}, "tag_id")
}

func (r *DocumentTagRepo) ListDocIDsByTag(ctx context.Context, userID, tagID string) ([]string, error) {
	return r.queryStringColumn(ctx, map[string]any{"user_id": userID, "tag_id": tagID}, "document_id")
}

func (r *DocumentTagRepo) ListByUser(ctx context.Context, userID string) ([]model.DocumentTag, error) {
	where := map[string]any{"user_id": userID}
	sqlStr, args, err := builder.BuildSelect("document_tags", where, []string{"user_id", "document_id", "tag_id"})
	if err != nil {
		return nil, fmt.Errorf("build select: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := conn(ctx, r.db).QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	items := make([]model.DocumentTag, 0)
	for rows.Next() {
		var item model.DocumentTag
		if err := rows.Scan(&item.UserID, &item.DocumentID, &item.TagID); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return items, nil
}

func (
	r *DocumentTagRepo) ListTagIDsByDocIDs(ctx context.Context,
	userID string,
	docIDs []string) (map[string][]string,
	error,
) {
	if len(docIDs) == 0 {
		return map[string][]string{}, nil
	}
	ids := make([]any, 0, len(docIDs))
	for _, id := range docIDs {
		ids = append(ids, id)
	}
	where := map[string]any{
		"user_id":      userID,
		"_custom_docs": builder.In{"document_id": ids},
	}
	sqlStr, args, err := builder.BuildSelect("document_tags", where, []string{"document_id", "tag_id"})
	if err != nil {
		return nil, fmt.Errorf("build select: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := conn(ctx, r.db).QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	result := make(map[string][]string)
	for rows.Next() {
		var docID string
		var tagID string
		if err := rows.Scan(&docID, &tagID); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		result[docID] = append(result[docID], tagID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("scan: %w", err)
	}
	return result, nil
}
