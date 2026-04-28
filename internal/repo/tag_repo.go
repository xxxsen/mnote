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

var tagColumns = []string{"id", "user_id", "name", "pinned", "ctime", "mtime"}

type TagRepo struct {
	db *sql.DB
}

func NewTagRepo(db *sql.DB) *TagRepo {
	return &TagRepo{db: db}
}

func (r *TagRepo) Create(ctx context.Context, tag *model.Tag) error {
	data := map[string]any{
		"id":      tag.ID,
		"user_id": tag.UserID,
		"name":    tag.Name,
		"pinned":  tag.Pinned,
		"ctime":   tag.Ctime,
		"mtime":   tag.Mtime,
	}
	sqlStr, args, err := builder.BuildInsert("tags", []map[string]any{data})
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

func (r *TagRepo) CreateBatch(ctx context.Context, tags []model.Tag) error {
	if len(tags) == 0 {
		return nil
	}
	rows := make([]map[string]any, 0, len(tags))
	for _, tag := range tags {
		rows = append(rows, map[string]any{
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

func (r *TagRepo) List(ctx context.Context, userID string) ([]model.Tag, error) {
	where := map[string]any{"user_id": userID, "_orderby": "pinned desc, mtime desc"}
	sqlStr, args, err := builder.BuildSelect("tags", where, []string{"id", "user_id", "name", "pinned", "ctime", "mtime"})
	if err != nil {
		return nil, fmt.Errorf("build select: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := conn(ctx, r.db).QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	tags := make([]model.Tag, 0)
	for rows.Next() {
		var tag model.Tag
		if err := rows.Scan(&tag.ID, &tag.UserID, &tag.Name, &tag.Pinned, &tag.Ctime, &tag.Mtime); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		tags = append(tags, tag)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return tags, nil
}

func (r *TagRepo) ListPage(ctx context.Context, userID, query string, limit, offset int) ([]model.Tag, error) {
	if offset < 0 {
		offset = 0
	}
	if query == "" {
		return r.listAllTags(ctx, userID, limit, offset)
	}
	return r.listTagsByQuery(ctx, userID, query, limit, offset)
}

func clampUint(v int) uint {
	if v < 0 {
		return 0
	}
	return uint(v)
}

func (r *TagRepo) listAllTags(ctx context.Context, userID string, limit, offset int) ([]model.Tag, error) {
	where := map[string]any{"user_id": userID, "_orderby": "pinned desc, mtime desc"}
	if limit > 0 {
		where["_limit"] = []uint{clampUint(offset), clampUint(limit)}
	}
	sqlStr, args, err := builder.BuildSelect("tags", where, tagColumns)
	if err != nil {
		return nil, fmt.Errorf("build select: %w", err)
	}
	return r.queryTags(ctx, sqlStr, args)
}

func (r *TagRepo) listTagsByQuery(ctx context.Context, userID, query string, limit, offset int) ([]model.Tag, error) {
	result := make([]model.Tag, 0)
	if offset == 0 {
		exact, err := r.findExactTag(ctx, userID, query)
		if err != nil {
			return nil, err
		}
		result = append(result, exact...)
	}
	remaining := limit
	if remaining > 0 {
		remaining -= len(result)
		if remaining <= 0 {
			return result, nil
		}
	}
	where := map[string]any{"user_id": userID, "_orderby": "pinned desc, mtime desc"}
	where["_custom_search"] = builder.Custom("name LIKE ?", "%"+query+"%")
	if len(result) > 0 {
		where["_custom_exclude"] = builder.Custom("name != ?", query)
	}
	if remaining > 0 {
		where["_limit"] = []uint{clampUint(offset), clampUint(remaining)}
	} else if limit > 0 {
		where["_limit"] = []uint{clampUint(offset), clampUint(limit)}
	}
	sqlStr, args, err := builder.BuildSelect("tags", where, tagColumns)
	if err != nil {
		return nil, fmt.Errorf("build select: %w", err)
	}
	fuzzy, err := r.queryTags(ctx, sqlStr, args)
	if err != nil {
		return nil, err
	}
	result = append(result, fuzzy...)
	return result, nil
}

func (r *TagRepo) queryTags(ctx context.Context, sqlStr string, args []any) ([]model.Tag, error) {
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := conn(ctx, r.db).QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	tags := make([]model.Tag, 0)
	for rows.Next() {
		var tag model.Tag
		if err := rows.Scan(&tag.ID, &tag.UserID, &tag.Name, &tag.Pinned, &tag.Ctime, &tag.Mtime); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		tags = append(tags, tag)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return tags, nil
}

func (r *TagRepo) findExactTag(ctx context.Context, userID, name string) ([]model.Tag, error) {
	where := map[string]any{"user_id": userID, "name": name}
	sqlStr, args, err := builder.BuildSelect("tags", where, tagColumns)
	if err != nil {
		return nil, fmt.Errorf("build select: %w", err)
	}
	return r.queryTags(ctx, sqlStr, args)
}

func (
	r *TagRepo) ListSummary(ctx context.Context,
	userID,
	query string,
	limit,
	offset int) ([]model.TagSummary,
	error,
) {
	if limit <= 0 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	sqlStr := "SELECT t.id, t.name, t.pinned, COUNT(dt.tag_id) AS cnt, MAX(t.mtime) as mtime FROM tags t " +
		"JOIN document_tags dt ON dt.tag_id = t.id AND dt.user_id = t.user_id " +
		"WHERE t.user_id = ?"
	args := []any{userID}
	if query != "" {
		sqlStr += " AND t.name LIKE ?"
		args = append(args, "%"+query+"%")
	}
	sqlStr += " GROUP BY t.id, t.name, t.pinned" +
		" HAVING COUNT(dt.tag_id) > 0" +
		" ORDER BY t.pinned DESC, cnt DESC, mtime DESC" +
		" LIMIT ? OFFSET ?"
	args = append(args, limit, offset)
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := conn(ctx, r.db).QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	items := make([]model.TagSummary, 0)
	for rows.Next() {
		var item model.TagSummary
		var mtime int64
		if err := rows.Scan(&item.ID, &item.Name, &item.Pinned, &item.Count, &mtime); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return items, nil
}

func (r *TagRepo) ListByIDs(ctx context.Context, userID string, ids []string) ([]model.Tag, error) {
	if len(ids) == 0 {
		return []model.Tag{}, nil
	}
	where := map[string]any{"user_id": userID, "id": ids, "_orderby": "pinned desc, mtime desc"}
	sqlStr, args, err := builder.BuildSelect("tags", where, []string{"id", "user_id", "name", "pinned", "ctime", "mtime"})
	if err != nil {
		return nil, fmt.Errorf("build select: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := conn(ctx, r.db).QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	tags := make([]model.Tag, 0)
	for rows.Next() {
		var tag model.Tag
		if err := rows.Scan(&tag.ID, &tag.UserID, &tag.Name, &tag.Pinned, &tag.Ctime, &tag.Mtime); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		tags = append(tags, tag)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return tags, nil
}

func (r *TagRepo) ListByNames(ctx context.Context, userID string, names []string) ([]model.Tag, error) {
	if len(names) == 0 {
		return []model.Tag{}, nil
	}
	args := make([]any, 0, len(names))
	for _, name := range names {
		args = append(args, name)
	}
	where := map[string]any{
		"user_id":     userID,
		"_custom_ids": builder.In{"name": args},
	}
	sqlStr, argsList, err := builder.BuildSelect("tags", where, []string{
		"id", "user_id", "name", "pinned", "ctime",
		"mtime",
	})
	if err != nil {
		return nil, fmt.Errorf("build select: %w", err)
	}
	sqlStr, argsList = dbutil.Finalize(sqlStr, argsList)
	rows, err := conn(ctx, r.db).QueryContext(ctx, sqlStr, argsList...)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	tags := make([]model.Tag, 0)
	for rows.Next() {
		var tag model.Tag
		if err := rows.Scan(&tag.ID, &tag.UserID, &tag.Name, &tag.Pinned, &tag.Ctime, &tag.Mtime); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		tags = append(tags, tag)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return tags, nil
}

func (r *TagRepo) UpdatePinned(ctx context.Context, userID, tagID string, pinned int, mtime int64) error {
	where := map[string]any{
		"id":      tagID,
		"user_id": userID,
	}
	update := map[string]any{
		"pinned": pinned,
		"mtime":  mtime,
	}
	sqlStr, args, err := builder.BuildUpdate("tags", where, update)
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

func (r *TagRepo) Delete(ctx context.Context, userID, tagID string) error {
	where := map[string]any{"id": tagID, "user_id": userID}
	sqlStr, args, err := builder.BuildDelete("tags", where)
	if err != nil {
		return fmt.Errorf("build delete: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	affected, err := dbutil.ExecAffected(ctx, conn(ctx, r.db), sqlStr, args)
	if err != nil {
		return fmt.Errorf("delete: %w", err)
	}
	if affected == 0 {
		return appErr.ErrNotFound
	}
	return nil
}
