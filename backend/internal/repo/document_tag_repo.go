package repo

import (
	"context"
	"database/sql"

	"github.com/didi/gendry/builder"

	"mnote/internal/model"
)

type DocumentTagRepo struct {
	db *sql.DB
}

func NewDocumentTagRepo(db *sql.DB) *DocumentTagRepo {
	return &DocumentTagRepo{db: db}
}

func (r *DocumentTagRepo) Add(ctx context.Context, docTag *model.DocumentTag) error {
	data := map[string]interface{}{
		"user_id":     docTag.UserID,
		"document_id": docTag.DocumentID,
		"tag_id":      docTag.TagID,
	}
	sqlStr, args, err := builder.BuildInsert("document_tags", []map[string]interface{}{data})
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, sqlStr, args...)
	return err
}

func (r *DocumentTagRepo) DeleteByDoc(ctx context.Context, userID, docID string) error {
	where := map[string]interface{}{"user_id": userID, "document_id": docID}
	sqlStr, args, err := builder.BuildDelete("document_tags", where)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, sqlStr, args...)
	return err
}

func (r *DocumentTagRepo) DeleteByTag(ctx context.Context, userID, tagID string) error {
	where := map[string]interface{}{"user_id": userID, "tag_id": tagID}
	sqlStr, args, err := builder.BuildDelete("document_tags", where)
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, sqlStr, args...)
	return err
}

func (r *DocumentTagRepo) ListTagIDs(ctx context.Context, userID, docID string) ([]string, error) {
	where := map[string]interface{}{"user_id": userID, "document_id": docID}
	sqlStr, args, err := builder.BuildSelect("document_tags", where, []string{"tag_id"})
	if err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tags := make([]string, 0)
	for rows.Next() {
		var tagID string
		if err := rows.Scan(&tagID); err != nil {
			return nil, err
		}
		tags = append(tags, tagID)
	}
	return tags, rows.Err()
}

func (r *DocumentTagRepo) ListDocIDsByTag(ctx context.Context, userID, tagID string) ([]string, error) {
	where := map[string]interface{}{"user_id": userID, "tag_id": tagID}
	sqlStr, args, err := builder.BuildSelect("document_tags", where, []string{"document_id"})
	if err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	docs := make([]string, 0)
	for rows.Next() {
		var docID string
		if err := rows.Scan(&docID); err != nil {
			return nil, err
		}
		docs = append(docs, docID)
	}
	return docs, rows.Err()
}

func (r *DocumentTagRepo) ListByUser(ctx context.Context, userID string) ([]model.DocumentTag, error) {
	where := map[string]interface{}{"user_id": userID}
	sqlStr, args, err := builder.BuildSelect("document_tags", where, []string{"user_id", "document_id", "tag_id"})
	if err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]model.DocumentTag, 0)
	for rows.Next() {
		var item model.DocumentTag
		if err := rows.Scan(&item.UserID, &item.DocumentID, &item.TagID); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
