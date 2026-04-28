package repo

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/didi/gendry/builder"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/dbutil"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

type SavedViewRepo struct {
	db *sql.DB
}

func NewSavedViewRepo(db *sql.DB) *SavedViewRepo {
	return &SavedViewRepo{db: db}
}

func (r *SavedViewRepo) List(ctx context.Context, userID string) ([]model.SavedView, error) {
	where := map[string]any{
		"user_id":  userID,
		"_orderby": "mtime desc",
	}
	sqlStr, args, err := builder.BuildSelect("saved_views", where, []string{
		"id", "user_id", "name", "search", "tag_id", "show_starred", "show_shared", "ctime", "mtime",
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

	items := make([]model.SavedView, 0)
	for rows.Next() {
		var item model.SavedView
		if err := rows.Scan(
			&item.ID, &item.UserID, &item.Name, &item.Search, &item.TagID,
			&item.ShowStarred, &item.ShowShared, &item.Ctime, &item.Mtime,
		); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return items, nil
}

func (r *SavedViewRepo) Create(ctx context.Context, item *model.SavedView) error {
	data := map[string]any{
		"id":           item.ID,
		"user_id":      item.UserID,
		"name":         item.Name,
		"search":       item.Search,
		"tag_id":       item.TagID,
		"show_starred": item.ShowStarred,
		"show_shared":  item.ShowShared,
		"ctime":        item.Ctime,
		"mtime":        item.Mtime,
	}
	sqlStr, args, err := builder.BuildInsert("saved_views", []map[string]any{data})
	if err != nil {
		return fmt.Errorf("build insert: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	if _, err := conn(ctx, r.db).ExecContext(ctx, sqlStr, args...); err != nil {
		if dbutil.IsConflict(err) {
			return appErr.ErrConflict
		}
		return fmt.Errorf("exec: %w", err)
	}
	return nil
}

func (r *SavedViewRepo) Delete(ctx context.Context, userID, id string) error {
	sqlStr, args, err := builder.BuildDelete("saved_views", map[string]any{
		"id":      id,
		"user_id": userID,
	})
	if err != nil {
		return fmt.Errorf("build delete: %w", err)
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
