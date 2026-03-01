package repo

import (
	"context"
	"database/sql"

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
	args := []interface{}{
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
	_, err := r.db.ExecContext(ctx, sqlStr, args...)
	return err
}

func (r *AssetRepo) ListByUser(ctx context.Context, userID, query string, limit, offset uint) ([]model.Asset, error) {
	sqlStr := `
		SELECT id, user_id, file_key, url, name, content_type, size, ctime, mtime
		FROM assets
		WHERE user_id = ?
	`
	args := []interface{}{userID}
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
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	items := make([]model.Asset, 0)
	for rows.Next() {
		var item model.Asset
		if err := rows.Scan(&item.ID, &item.UserID, &item.FileKey, &item.URL, &item.Name, &item.ContentType, &item.Size, &item.Ctime, &item.Mtime); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *AssetRepo) GetByID(ctx context.Context, userID, assetID string) (*model.Asset, error) {
	sqlStr, args, err := builder.BuildSelect("assets", map[string]interface{}{"id": assetID, "user_id": userID}, []string{
		"id", "user_id", "file_key", "url", "name", "content_type", "size", "ctime", "mtime",
	})
	if err != nil {
		return nil, err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	if !rows.Next() {
		return nil, appErr.ErrNotFound
	}
	var item model.Asset
	if err := rows.Scan(&item.ID, &item.UserID, &item.FileKey, &item.URL, &item.Name, &item.ContentType, &item.Size, &item.Ctime, &item.Mtime); err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *AssetRepo) ListByFileKeys(ctx context.Context, userID string, fileKeys []string) ([]model.Asset, error) {
	if len(fileKeys) == 0 {
		return []model.Asset{}, nil
	}
	sqlStr, args, err := builder.BuildSelect("assets", map[string]interface{}{"user_id": userID, "file_key in": fileKeys}, []string{
		"id", "user_id", "file_key", "url", "name", "content_type", "size", "ctime", "mtime",
	})
	if err != nil {
		return nil, err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	items := make([]model.Asset, 0)
	for rows.Next() {
		var item model.Asset
		if err := rows.Scan(&item.ID, &item.UserID, &item.FileKey, &item.URL, &item.Name, &item.ContentType, &item.Size, &item.Ctime, &item.Mtime); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *AssetRepo) DeleteByID(ctx context.Context, userID, assetID string) error {
	sqlStr, args, err := builder.BuildDelete("assets", map[string]interface{}{"id": assetID, "user_id": userID})
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
