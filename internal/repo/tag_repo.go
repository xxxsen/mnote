package repo

import (
	"context"
	"database/sql"

	"github.com/didi/gendry/builder"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

type TagRepo struct {
	db *sql.DB
}

func NewTagRepo(db *sql.DB) *TagRepo {
	return &TagRepo{db: db}
}

func (r *TagRepo) Create(ctx context.Context, tag *model.Tag) error {
	data := map[string]interface{}{
		"id":      tag.ID,
		"user_id": tag.UserID,
		"name":    tag.Name,
		"ctime":   tag.Ctime,
		"mtime":   tag.Mtime,
	}
	sqlStr, args, err := builder.BuildInsert("tags", []map[string]interface{}{data})
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, sqlStr, args...)
	return err
}

func (r *TagRepo) List(ctx context.Context, userID string) ([]model.Tag, error) {
	where := map[string]interface{}{"user_id": userID, "_orderby": "mtime desc"}
	sqlStr, args, err := builder.BuildSelect("tags", where, []string{"id", "user_id", "name", "ctime", "mtime"})
	if err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tags := make([]model.Tag, 0)
	for rows.Next() {
		var tag model.Tag
		if err := rows.Scan(&tag.ID, &tag.UserID, &tag.Name, &tag.Ctime, &tag.Mtime); err != nil {
			return nil, err
		}
		tags = append(tags, tag)
	}
	return tags, rows.Err()
}

func (r *TagRepo) ListByIDs(ctx context.Context, userID string, ids []string) ([]model.Tag, error) {
	if len(ids) == 0 {
		return []model.Tag{}, nil
	}
	where := map[string]interface{}{"user_id": userID, "id": ids, "_orderby": "mtime desc"}
	sqlStr, args, err := builder.BuildSelect("tags", where, []string{"id", "user_id", "name", "ctime", "mtime"})
	if err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	tags := make([]model.Tag, 0)
	for rows.Next() {
		var tag model.Tag
		if err := rows.Scan(&tag.ID, &tag.UserID, &tag.Name, &tag.Ctime, &tag.Mtime); err != nil {
			return nil, err
		}
		tags = append(tags, tag)
	}
	return tags, rows.Err()
}

func (r *TagRepo) Delete(ctx context.Context, userID, tagID string) error {
	where := map[string]interface{}{
		"id":      tagID,
		"user_id": userID,
	}
	sqlStr, args, err := builder.BuildDelete("tags", where)
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
