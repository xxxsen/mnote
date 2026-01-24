package repo

import (
	"context"
	"database/sql"

	"github.com/didi/gendry/builder"

	"mnote/internal/model"
	appErr "mnote/internal/pkg/errors"
)

type VersionRepo struct {
	db *sql.DB
}

func NewVersionRepo(db *sql.DB) *VersionRepo {
	return &VersionRepo{db: db}
}

func (r *VersionRepo) Create(ctx context.Context, version *model.DocumentVersion) error {
	data := map[string]interface{}{
		"id":          version.ID,
		"user_id":     version.UserID,
		"document_id": version.DocumentID,
		"version":     version.Version,
		"title":       version.Title,
		"content":     version.Content,
		"ctime":       version.Ctime,
	}
	sqlStr, args, err := builder.BuildInsert("document_versions", []map[string]interface{}{data})
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, sqlStr, args...)
	return err
}

func (r *VersionRepo) GetLatestVersion(ctx context.Context, userID, docID string) (int, error) {
	where := map[string]interface{}{
		"user_id":     userID,
		"document_id": docID,
		"_orderby":    "version desc",
		"_limit":      []uint{0, 1},
	}
	sqlStr, args, err := builder.BuildSelect("document_versions", where, []string{"version"})
	if err != nil {
		return 0, err
	}
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	if !rows.Next() {
		return 0, appErr.ErrNotFound
	}
	var version int
	if err := rows.Scan(&version); err != nil {
		return 0, err
	}
	return version, nil
}

func (r *VersionRepo) List(ctx context.Context, userID, docID string) ([]model.DocumentVersion, error) {
	where := map[string]interface{}{
		"user_id":     userID,
		"document_id": docID,
		"_orderby":    "version desc",
	}
	sqlStr, args, err := builder.BuildSelect("document_versions", where, []string{"id", "user_id", "document_id", "version", "title", "content", "ctime"})
	if err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	versions := make([]model.DocumentVersion, 0)
	for rows.Next() {
		var v model.DocumentVersion
		if err := rows.Scan(&v.ID, &v.UserID, &v.DocumentID, &v.Version, &v.Title, &v.Content, &v.Ctime); err != nil {
			return nil, err
		}
		versions = append(versions, v)
	}
	return versions, rows.Err()
}

func (r *VersionRepo) ListByUser(ctx context.Context, userID string) ([]model.DocumentVersion, error) {
	where := map[string]interface{}{
		"user_id":  userID,
		"_orderby": "ctime desc",
	}
	sqlStr, args, err := builder.BuildSelect("document_versions", where, []string{"id", "user_id", "document_id", "version", "title", "content", "ctime"})
	if err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	versions := make([]model.DocumentVersion, 0)
	for rows.Next() {
		var v model.DocumentVersion
		if err := rows.Scan(&v.ID, &v.UserID, &v.DocumentID, &v.Version, &v.Title, &v.Content, &v.Ctime); err != nil {
			return nil, err
		}
		versions = append(versions, v)
	}
	return versions, rows.Err()
}

func (r *VersionRepo) GetByVersion(ctx context.Context, userID, docID string, version int) (*model.DocumentVersion, error) {
	where := map[string]interface{}{
		"user_id":     userID,
		"document_id": docID,
		"version":     version,
	}
	sqlStr, args, err := builder.BuildSelect("document_versions", where, []string{"id", "user_id", "document_id", "version", "title", "content", "ctime"})
	if err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	if !rows.Next() {
		return nil, appErr.ErrNotFound
	}
	var v model.DocumentVersion
	if err := rows.Scan(&v.ID, &v.UserID, &v.DocumentID, &v.Version, &v.Title, &v.Content, &v.Ctime); err != nil {
		return nil, err
	}
	return &v, nil
}
