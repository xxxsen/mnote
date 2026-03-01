package repo

import (
	"context"
	"database/sql"

	"github.com/didi/gendry/builder"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/dbutil"
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
		"pinned":  tag.Pinned,
		"ctime":   tag.Ctime,
		"mtime":   tag.Mtime,
	}
	sqlStr, args, err := builder.BuildInsert("tags", []map[string]interface{}{data})
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
			"pinned":  tag.Pinned,
			"ctime":   tag.Ctime,
			"mtime":   tag.Mtime,
		})
	}
	sqlStr, args, err := builder.BuildInsert("tags", rows)
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

func (r *TagRepo) List(ctx context.Context, userID string) ([]model.Tag, error) {
	where := map[string]interface{}{"user_id": userID, "_orderby": "pinned desc, mtime desc"}
	sqlStr, args, err := builder.BuildSelect("tags", where, []string{"id", "user_id", "name", "pinned", "ctime", "mtime"})
	if err != nil {
		return nil, err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	tags := make([]model.Tag, 0)
	for rows.Next() {
		var tag model.Tag
		if err := rows.Scan(&tag.ID, &tag.UserID, &tag.Name, &tag.Pinned, &tag.Ctime, &tag.Mtime); err != nil {
			return nil, err
		}
		tags = append(tags, tag)
	}
	return tags, rows.Err()
}

func (r *TagRepo) ListPage(ctx context.Context, userID string, query string, limit, offset int) ([]model.Tag, error) {
	if query == "" {
		where := map[string]interface{}{"user_id": userID, "_orderby": "pinned desc, mtime desc"}
		if limit > 0 {
			if offset < 0 {
				offset = 0
			}
			where["_limit"] = []uint{uint(offset), uint(limit)}
		}
		sqlStr, args, err := builder.BuildSelect("tags", where, []string{"id", "user_id", "name", "pinned", "ctime", "mtime"})
		if err != nil {
			return nil, err
		}
		sqlStr, args = dbutil.Finalize(sqlStr, args)
		rows, err := r.db.QueryContext(ctx, sqlStr, args...)
		if err != nil {
			return nil, err
		}
		defer func() { _ = rows.Close() }()
		tags := make([]model.Tag, 0)
		for rows.Next() {
			var tag model.Tag
			if err := rows.Scan(&tag.ID, &tag.UserID, &tag.Name, &tag.Pinned, &tag.Ctime, &tag.Mtime); err != nil {
				return nil, err
			}
			tags = append(tags, tag)
		}
		return tags, rows.Err()
	}

	if offset < 0 {
		offset = 0
	}

	result := make([]model.Tag, 0)
	if offset == 0 {
		exactWhere := map[string]interface{}{"user_id": userID, "name": query}
		exactSQL, exactArgs, err := builder.BuildSelect("tags", exactWhere, []string{"id", "user_id", "name", "pinned", "ctime", "mtime"})
		if err != nil {
			return nil, err
		}
		exactSQL, exactArgs = dbutil.Finalize(exactSQL, exactArgs)
		rows, err := r.db.QueryContext(ctx, exactSQL, exactArgs...)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var tag model.Tag
			if err := rows.Scan(&tag.ID, &tag.UserID, &tag.Name, &tag.Pinned, &tag.Ctime, &tag.Mtime); err != nil {
				_ = rows.Close()
				return nil, err
			}
			result = append(result, tag)
		}
		if err := rows.Err(); err != nil {
			_ = rows.Close()
			return nil, err
		}
		_ = rows.Close()
	}

	remaining := limit
	if remaining > 0 {
		remaining -= len(result)
		if remaining <= 0 {
			return result, nil
		}
	}

	where := map[string]interface{}{"user_id": userID, "_orderby": "pinned desc, mtime desc"}
	where["_custom_search"] = builder.Custom("name LIKE ?", "%"+query+"%")
	if len(result) > 0 {
		where["_custom_exclude"] = builder.Custom("name != ?", query)
	}
	if remaining > 0 {
		where["_limit"] = []uint{uint(offset), uint(remaining)}
	} else if limit > 0 {
		where["_limit"] = []uint{uint(offset), uint(limit)}
	}
	sqlStr, args, err := builder.BuildSelect("tags", where, []string{"id", "user_id", "name", "pinned", "ctime", "mtime"})
	if err != nil {
		return nil, err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var tag model.Tag
		if err := rows.Scan(&tag.ID, &tag.UserID, &tag.Name, &tag.Pinned, &tag.Ctime, &tag.Mtime); err != nil {
			return nil, err
		}
		result = append(result, tag)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return result, nil
}

func (r *TagRepo) ListSummary(ctx context.Context, userID string, query string, limit, offset int) ([]model.TagSummary, error) {
	if limit <= 0 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	sqlStr := "SELECT t.id, t.name, t.pinned, COUNT(dt.tag_id) AS cnt, MAX(t.mtime) as mtime FROM tags t " +
		"JOIN document_tags dt ON dt.tag_id = t.id AND dt.user_id = t.user_id " +
		"WHERE t.user_id = ?"
	args := []interface{}{userID}
	if query != "" {
		sqlStr += " AND t.name LIKE ?"
		args = append(args, "%"+query+"%")
	}
	sqlStr += " GROUP BY t.id, t.name, t.pinned HAVING COUNT(dt.tag_id) > 0 ORDER BY t.pinned DESC, cnt DESC, mtime DESC LIMIT ? OFFSET ?"
	args = append(args, limit, offset)
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	items := make([]model.TagSummary, 0)
	for rows.Next() {
		var item model.TagSummary
		var mtime int64
		if err := rows.Scan(&item.ID, &item.Name, &item.Pinned, &item.Count, &mtime); err != nil {
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
	where := map[string]interface{}{"user_id": userID, "id": ids, "_orderby": "pinned desc, mtime desc"}
	sqlStr, args, err := builder.BuildSelect("tags", where, []string{"id", "user_id", "name", "pinned", "ctime", "mtime"})
	if err != nil {
		return nil, err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	tags := make([]model.Tag, 0)
	for rows.Next() {
		var tag model.Tag
		if err := rows.Scan(&tag.ID, &tag.UserID, &tag.Name, &tag.Pinned, &tag.Ctime, &tag.Mtime); err != nil {
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
	sqlStr, argsList, err := builder.BuildSelect("tags", where, []string{"id", "user_id", "name", "pinned", "ctime", "mtime"})
	if err != nil {
		return nil, err
	}
	sqlStr, argsList = dbutil.Finalize(sqlStr, argsList)
	rows, err := r.db.QueryContext(ctx, sqlStr, argsList...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	tags := make([]model.Tag, 0)
	for rows.Next() {
		var tag model.Tag
		if err := rows.Scan(&tag.ID, &tag.UserID, &tag.Name, &tag.Pinned, &tag.Ctime, &tag.Mtime); err != nil {
			return nil, err
		}
		tags = append(tags, tag)
	}
	return tags, rows.Err()
}

func (r *TagRepo) UpdatePinned(ctx context.Context, userID, tagID string, pinned int, mtime int64) error {
	where := map[string]interface{}{
		"id":      tagID,
		"user_id": userID,
	}
	update := map[string]interface{}{
		"pinned": pinned,
		"mtime":  mtime,
	}
	sqlStr, args, err := builder.BuildUpdate("tags", where, update)
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

func (r *TagRepo) Delete(ctx context.Context, userID, tagID string) error {
	where := map[string]interface{}{
		"id":      tagID,
		"user_id": userID,
	}
	sqlStr, args, err := builder.BuildDelete("tags", where)
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
