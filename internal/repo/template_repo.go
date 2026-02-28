package repo

import (
	"context"
	"database/sql"
	"encoding/json"

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
	variablesJSON, _ := json.Marshal(tpl.Variables)
	tagIDsJSON, _ := json.Marshal(tpl.DefaultTagIDs)
	data := map[string]interface{}{
		"id":                   tpl.ID,
		"user_id":              tpl.UserID,
		"name":                 tpl.Name,
		"description":          tpl.Description,
		"content":              tpl.Content,
		"category":             tpl.Category,
		"variables_json":       string(variablesJSON),
		"default_tag_ids_json": string(tagIDsJSON),
		"ctime":                tpl.Ctime,
		"mtime":                tpl.Mtime,
	}
	sqlStr, args, err := builder.BuildInsert("templates", []map[string]interface{}{data})
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

func (r *TemplateRepo) Update(ctx context.Context, tpl *model.Template) error {
	variablesJSON, _ := json.Marshal(tpl.Variables)
	tagIDsJSON, _ := json.Marshal(tpl.DefaultTagIDs)
	where := map[string]interface{}{"id": tpl.ID, "user_id": tpl.UserID}
	update := map[string]interface{}{
		"name":                 tpl.Name,
		"description":          tpl.Description,
		"content":              tpl.Content,
		"category":             tpl.Category,
		"variables_json":       string(variablesJSON),
		"default_tag_ids_json": string(tagIDsJSON),
		"mtime":                tpl.Mtime,
	}
	sqlStr, args, err := builder.BuildUpdate("templates", where, update)
	if err != nil {
		return err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	res, err := r.db.ExecContext(ctx, sqlStr, args...)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return appErr.ErrNotFound
	}
	return nil
}

func (r *TemplateRepo) Delete(ctx context.Context, userID, templateID string) error {
	sqlStr, args, err := builder.BuildDelete("templates", map[string]interface{}{"id": templateID, "user_id": userID})
	if err != nil {
		return err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	res, err := r.db.ExecContext(ctx, sqlStr, args...)
	if err != nil {
		return err
	}
	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return appErr.ErrNotFound
	}
	return nil
}

func (r *TemplateRepo) GetByID(ctx context.Context, userID, templateID string) (*model.Template, error) {
	sqlStr, args, err := builder.BuildSelect("templates", map[string]interface{}{"id": templateID, "user_id": userID}, []string{
		"id", "user_id", "name", "description", "content", "category", "variables_json", "default_tag_ids_json", "ctime", "mtime",
	})
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
	return scanTemplate(rows)
}

func (r *TemplateRepo) ListByUser(ctx context.Context, userID string) ([]model.Template, error) {
	sqlStr := `
		SELECT id, user_id, name, description, content, category, variables_json, default_tag_ids_json, ctime, mtime
		FROM templates
		WHERE user_id = ?
		ORDER BY mtime DESC
	`
	args := []interface{}{userID}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]model.Template, 0)
	for rows.Next() {
		tpl, err := scanTemplate(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, *tpl)
	}
	return items, rows.Err()
}

type templateScanner interface {
	Scan(dest ...interface{}) error
}

func scanTemplate(s templateScanner) (*model.Template, error) {
	var tpl model.Template
	var variablesJSON string
	var tagIDsJSON string
	if err := s.Scan(
		&tpl.ID,
		&tpl.UserID,
		&tpl.Name,
		&tpl.Description,
		&tpl.Content,
		&tpl.Category,
		&variablesJSON,
		&tagIDsJSON,
		&tpl.Ctime,
		&tpl.Mtime,
	); err != nil {
		return nil, err
	}
	_ = json.Unmarshal([]byte(variablesJSON), &tpl.Variables)
	_ = json.Unmarshal([]byte(tagIDsJSON), &tpl.DefaultTagIDs)
	return &tpl, nil
}
