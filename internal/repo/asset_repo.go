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

type AssetRepo struct {
	db *sql.DB
}

func NewAssetRepo(db *sql.DB) *AssetRepo {
	return &AssetRepo{db: db}
}

func (r *AssetRepo) UpsertByFileKey(ctx context.Context, asset *model.Asset) error {
	sqlStr := `
		INSERT INTO assets (id, user_id, file_key, url, name, content_type, size, ctime, mtime)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (user_id, file_key)
		DO UPDATE SET
			url = EXCLUDED.url,
			name = EXCLUDED.name,
			content_type = EXCLUDED.content_type,
			size = EXCLUDED.size,
			mtime = EXCLUDED.mtime
	`
	args := []any{
		asset.ID,
		asset.UserID,
		asset.FileKey,
		asset.URL,
		asset.Name,
		asset.ContentType,
		asset.Size,
		asset.Ctime,
		asset.Mtime,
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	_, err := conn(ctx, r.db).ExecContext(ctx, sqlStr, args...)
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	return nil
}

func (r *AssetRepo) ListByUser(ctx context.Context, userID, query string, limit, offset uint) ([]model.Asset, error) {
	sqlStr := `
		SELECT id, user_id, file_key, url, name, content_type, size, ctime, mtime
		FROM assets
		WHERE user_id = ?
	`
	args := []any{userID}
	if query != "" {
		sqlStr += ` AND (name LIKE ? OR content_type LIKE ?)`
		like := "%" + query + "%"
		args = append(args, like, like)
	}
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
	items := make([]model.Asset, 0)
	for rows.Next() {
		var item model.Asset
		if err := rows.Scan(&item.ID, &item.UserID, &item.FileKey, &item.URL, &item.Name, &item.ContentType, &item.Size,
			&item.Ctime, &item.Mtime); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return items, nil
}

func (r *AssetRepo) GetByID(ctx context.Context, userID, assetID string) (*model.Asset, error) {
	sqlStr, args, err := builder.BuildSelect("assets", map[string]any{"id": assetID, "user_id": userID}, []string{
		"id", "user_id", "file_key", "url", "name", "content_type", "size", "ctime", "mtime",
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
	var item model.Asset
	if err := rows.Scan(&item.ID, &item.UserID, &item.FileKey, &item.URL, &item.Name, &item.ContentType, &item.Size,
		&item.Ctime, &item.Mtime); err != nil {
		return nil, fmt.Errorf("scan: %w", err)
	}
	return &item, nil
}

func (r *AssetRepo) queryAssets(ctx context.Context, where map[string]any) ([]model.Asset, error) {
	cols := []string{
		"id", "user_id", "file_key", "url", "name",
		"content_type", "size", "ctime", "mtime",
	}
	sqlStr, args, err := builder.BuildSelect("assets", where, cols)
	if err != nil {
		return nil, fmt.Errorf("build select: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := conn(ctx, r.db).QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	items := make([]model.Asset, 0)
	for rows.Next() {
		var item model.Asset
		if err := rows.Scan(
			&item.ID, &item.UserID, &item.FileKey, &item.URL,
			&item.Name, &item.ContentType, &item.Size,
			&item.Ctime, &item.Mtime,
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

func (r *AssetRepo) ListByFileKeys(ctx context.Context, userID string, fileKeys []string) ([]model.Asset, error) {
	if len(fileKeys) == 0 {
		return []model.Asset{}, nil
	}
	return r.queryAssets(ctx, map[string]any{"user_id": userID, "file_key in": fileKeys})
}

func (r *AssetRepo) ListByURLs(ctx context.Context, userID string, urls []string) ([]model.Asset, error) {
	if len(urls) == 0 {
		return []model.Asset{}, nil
	}
	return r.queryAssets(ctx, map[string]any{"user_id": userID, "url in": urls})
}
