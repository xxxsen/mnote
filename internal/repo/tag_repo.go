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

func (r *TagRepo) CreateBatch(ctx context.Context, tags []model.Tag) error {
	if len(tags) == 0 {
		return nil
	}
	rows := make([]map[string]interface{}, 0, len(tags))
	for _, tag := range tags {
		rows = append(rows, map[string]interface{}{
			"id":      tag.ID,
			"user_id": tag.UserID,
			"name":    tag.Name,
			"ctime":   tag.Ctime,
			"mtime":   tag.Mtime,
		})
	}
	sqlStr, args, err := builder.BuildInsert("tags", rows)
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

func (r *TagRepo) ListPage(ctx context.Context, userID string, query string, limit, offset int) ([]model.Tag, error) {
	where := map[string]interface{}{"user_id": userID, "_orderby": "mtime desc"}
	if query != "" {
		where["_custom_search"] = builder.Custom("name LIKE ?", "%"+query+"%")
	}
	if limit > 0 {
		if offset < 0 {
			offset = 0
		}
		where["_limit"] = []uint{uint(offset), uint(limit)}
	}
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

func (r *TagRepo) ListSummary(ctx context.Context, userID string, query string, limit, offset int) ([]model.TagSummary, error) {
	if limit <= 0 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	sqlStr := "SELECT t.id, t.name, COUNT(dt.tag_id) AS cnt, MAX(t.mtime) as mtime FROM tags t " +
		"JOIN document_tags dt ON dt.tag_id = t.id AND dt.user_id = t.user_id " +
		"WHERE t.user_id = ?"
	args := []interface{}{userID}
	if query != "" {
		sqlStr += " AND t.name LIKE ?"
		args = append(args, "%"+query+"%")
	}
	sqlStr += " GROUP BY t.id, t.name HAVING cnt > 0 ORDER BY cnt DESC, mtime DESC LIMIT ? OFFSET ?"
	args = append(args, limit, offset)
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]model.TagSummary, 0)
	for rows.Next() {
		var item model.TagSummary
		var mtime int64
		if err := rows.Scan(&item.ID, &item.Name, &item.Count, &mtime); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
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

func (r *TagRepo) ListByNames(ctx context.Context, userID string, names []string) ([]model.Tag, error) {
	if len(names) == 0 {
		return []model.Tag{}, nil
	}
	args := make([]interface{}, 0, len(names))
	for _, name := range names {
		args = append(args, name)
	}
	where := map[string]interface{}{
		"user_id":     userID,
		"_custom_ids": builder.In{"name": args},
	}
	sqlStr, argsList, err := builder.BuildSelect("tags", where, []string{"id", "user_id", "name", "ctime", "mtime"})
	if err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, sqlStr, argsList...)
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
