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

type VersionRepo struct {
	db *sql.DB
}

func NewVersionRepo(db *sql.DB) *VersionRepo {
	return &VersionRepo{db: db}
}

func (r *VersionRepo) Create(ctx context.Context, version *model.DocumentVersion) error {
	data := map[string]any{
		"id":          version.ID,
		"user_id":     version.UserID,
		"document_id": version.DocumentID,
		"version":     version.Version,
		"title":       version.Title,
		"content":     version.Content,
		"ctime":       version.Ctime,
	}
	sqlStr, args, err := builder.BuildInsert("document_versions", []map[string]any{data})
	if err != nil {
		return fmt.Errorf("build insert: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	_, err = conn(ctx, r.db).ExecContext(ctx, sqlStr, args...)
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	return nil
}

func (r *VersionRepo) GetLatestVersion(ctx context.Context, userID, docID string) (int, error) {
	where := map[string]any{
		"user_id":     userID,
		"document_id": docID,
		"_orderby":    "version desc",
		"_limit":      []uint{0, 1},
	}
	sqlStr, args, err := builder.BuildSelect("document_versions", where, []string{"version"})
	if err != nil {
		return 0, fmt.Errorf("build select: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := conn(ctx, r.db).QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return 0, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return 0, fmt.Errorf("query: %w", err)
		}
		return 0, appErr.ErrNotFound
	}
	var version int
	if err := rows.Scan(&version); err != nil {
		return 0, fmt.Errorf("scan: %w", err)
	}
	return version, nil
}

func (r *VersionRepo) List(ctx context.Context, userID, docID string) ([]model.DocumentVersion, error) {
	where := map[string]any{
		"user_id":     userID,
		"document_id": docID,
		"_orderby":    "version desc",
	}
	sqlStr, args, err := builder.BuildSelect("document_versions", where, []string{
		"id", "user_id", "document_id",
		"version", "title", "content", "ctime",
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
	versions := make([]model.DocumentVersion, 0)
	for rows.Next() {
		var v model.DocumentVersion
		if err := rows.Scan(&v.ID, &v.UserID, &v.DocumentID, &v.Version, &v.Title, &v.Content, &v.Ctime); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		versions = append(versions, v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return versions, nil
}

func (r *VersionRepo) ListSummaries(ctx context.Context, userID, docID string) ([]model.DocumentVersionSummary, error) {
	where := map[string]any{
		"user_id":     userID,
		"document_id": docID,
		"_orderby":    "version desc",
	}
	sqlStr, args, err := builder.BuildSelect("document_versions", where, []string{
		"id", "document_id", "version",
		"title", "ctime",
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
	versions := make([]model.DocumentVersionSummary, 0)
	for rows.Next() {
		var v model.DocumentVersionSummary
		if err := rows.Scan(&v.ID, &v.DocumentID, &v.Version, &v.Title, &v.Ctime); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		versions = append(versions, v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return versions, nil
}

func (r *VersionRepo) ListByUser(ctx context.Context, userID string) ([]model.DocumentVersion, error) {
	where := map[string]any{
		"user_id":  userID,
		"_orderby": "ctime desc",
	}
	sqlStr, args, err := builder.BuildSelect("document_versions", where, []string{
		"id", "user_id", "document_id",
		"version", "title", "content", "ctime",
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
	versions := make([]model.DocumentVersion, 0)
	for rows.Next() {
		var v model.DocumentVersion
		if err := rows.Scan(&v.ID, &v.UserID, &v.DocumentID, &v.Version, &v.Title, &v.Content, &v.Ctime); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		versions = append(versions, v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return versions, nil
}

func (
	r *VersionRepo) GetByVersion(ctx context.Context,
	userID,
	docID string,
	version int) (*model.DocumentVersion,
	error,
) {
	where := map[string]any{
		"user_id":     userID,
		"document_id": docID,
		"version":     version,
	}
	sqlStr, args, err := builder.BuildSelect("document_versions", where, []string{
		"id", "user_id", "document_id",
		"version", "title", "content", "ctime",
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
	var v model.DocumentVersion
	if err := rows.Scan(&v.ID, &v.UserID, &v.DocumentID, &v.Version, &v.Title, &v.Content, &v.Ctime); err != nil {
		return nil, fmt.Errorf("scan: %w", err)
	}
	return &v, nil
}

func (r *VersionRepo) DeleteOldVersions(ctx context.Context, userID, docID string, keep int) error {
	if keep <= 0 {
		return nil
	}
	sqlStr := `
		DELETE FROM document_versions
		WHERE user_id = $1
		  AND document_id = $2
		  AND id NOT IN (
			SELECT id
			FROM document_versions
			WHERE user_id = $3
			  AND document_id = $4
			ORDER BY version DESC
			LIMIT $5
		  )
	`
	_, err := conn(ctx, r.db).ExecContext(ctx, sqlStr, userID, docID, userID, docID, keep)
	if err != nil {
		return fmt.Errorf("prune old versions: %w", err)
	}
	return nil
}
