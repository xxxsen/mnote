package repo

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/didi/gendry/builder"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/dbutil"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

type TemplateRepo struct {
	db *sql.DB
}

func NewTemplateRepo(db *sql.DB) *TemplateRepo {
	return &TemplateRepo{db: db}
}

func (r *TemplateRepo) Create(ctx context.Context, tpl *model.Template) error {
	tagIDsJSON, _ := json.Marshal(tpl.DefaultTagIDs)
	data := map[string]any{
		"id":                   tpl.ID,
		"user_id":              tpl.UserID,
		"name":                 tpl.Name,
		"description":          tpl.Description,
		"content":              tpl.Content,
		"default_tag_ids_json": string(tagIDsJSON),
		"ctime":                tpl.Ctime,
		"mtime":                tpl.Mtime,
	}
	sqlStr, args, err := builder.BuildInsert("templates", []map[string]any{data})
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

func (r *TemplateRepo) Update(ctx context.Context, tpl *model.Template) error {
	tagIDsJSON, _ := json.Marshal(tpl.DefaultTagIDs)
	where := map[string]any{"id": tpl.ID, "user_id": tpl.UserID}
	update := map[string]any{
		"name":                 tpl.Name,
		"description":          tpl.Description,
		"content":              tpl.Content,
		"default_tag_ids_json": string(tagIDsJSON),
		"mtime":                tpl.Mtime,
	}
	sqlStr, args, err := builder.BuildUpdate("templates", where, update)
	if err != nil {
		return fmt.Errorf("build update: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	res, err := conn(ctx, r.db).ExecContext(ctx, sqlStr, args...)
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	if affected == 0 {
		return appErr.ErrNotFound
	}
	return nil
}

func (r *TemplateRepo) Delete(ctx context.Context, userID, templateID string) error {
	sqlStr, args, err := builder.BuildDelete("templates", map[string]any{"id": templateID, "user_id": userID})
	if err != nil {
		return fmt.Errorf("build delete: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	res, err := conn(ctx, r.db).ExecContext(ctx, sqlStr, args...)
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	if affected == 0 {
		return appErr.ErrNotFound
	}
	return nil
}

func (r *TemplateRepo) GetByID(ctx context.Context, userID, templateID string) (*model.Template, error) {
	sqlStr, args, err := builder.BuildSelect("templates", map[string]any{"id": templateID, "user_id": userID}, []string{
		"id", "user_id", "name", "description", "content", "default_tag_ids_json", "ctime", "mtime",
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
	return scanTemplate(rows)
}

func (r *TemplateRepo) ListByUser(ctx context.Context, userID string) ([]model.Template, error) {
	sqlStr := `
		SELECT id, user_id, name, description, content, default_tag_ids_json, ctime, mtime
		FROM templates
		WHERE user_id = ?
		ORDER BY mtime DESC
	`
	args := []any{userID}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := conn(ctx, r.db).QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	items := make([]model.Template, 0)
	for rows.Next() {
		tpl, err := scanTemplate(rows)
		if err != nil {
			return nil, fmt.Errorf("repo: %w", err)
		}
		items = append(items, *tpl)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return items, nil
}

func (
	r *TemplateRepo) ListMetaByUser(ctx context.Context,
	userID string,
	limit,
	offset int) ([]model.TemplateMeta,
	error,
) {
	sqlStr := `
		SELECT id, user_id, name, description, default_tag_ids_json, ctime, mtime
		FROM templates
		WHERE user_id = ?
	`
	args := []any{userID}
	sqlStr += ` ORDER BY mtime DESC`
	if limit > 0 {
		sqlStr += ` LIMIT ? OFFSET ?`
		args = append(args, limit, offset)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := conn(ctx, r.db).QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	items := make([]model.TemplateMeta, 0)
	for rows.Next() {
		tpl, err := scanTemplateMeta(rows)
		if err != nil {
			return nil, fmt.Errorf("repo: %w", err)
		}
		items = append(items, *tpl)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return items, nil
}

func (r *TemplateRepo) CountByUser(ctx context.Context, userID string) (int, error) {
	query, args := dbutil.Finalize("SELECT COUNT(*) FROM templates WHERE user_id = ?", []any{userID})
	row := conn(ctx, r.db).QueryRowContext(ctx, query, args...)
	count := 0
	if err := row.Scan(&count); err != nil {
		return 0, fmt.Errorf("scan: %w", err)
	}
	return count, nil
}

type templateScanner interface {
	Scan(dest ...any) error
}

func scanTemplate(s templateScanner) (*model.Template, error) {
	var tpl model.Template
	var tagIDsJSON string
	if err := s.Scan(
		&tpl.ID,
		&tpl.UserID,
		&tpl.Name,
		&tpl.Description,
		&tpl.Content,
		&tagIDsJSON,
		&tpl.Ctime,
		&tpl.Mtime,
	); err != nil {
		return nil, fmt.Errorf("repo: %w", err)
	}
	_ = json.Unmarshal([]byte(tagIDsJSON), &tpl.DefaultTagIDs)
	return &tpl, nil
}

func scanTemplateMeta(s templateScanner) (*model.TemplateMeta, error) {
	var tpl model.TemplateMeta
	var tagIDsJSON string
	if err := s.Scan(
		&tpl.ID,
		&tpl.UserID,
		&tpl.Name,
		&tpl.Description,
		&tagIDsJSON,
		&tpl.Ctime,
		&tpl.Mtime,
	); err != nil {
		return nil, fmt.Errorf("repo: %w", err)
	}
	_ = json.Unmarshal([]byte(tagIDsJSON), &tpl.DefaultTagIDs)
	return &tpl, nil
}
