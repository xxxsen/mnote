package repo

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/didi/gendry/builder"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/dbutil"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

type AssetRepo struct {
	db *sql.DB
}

var errInvalidAssetState = errors.New("invalid persisted asset state")

func NewAssetRepo(db *sql.DB) *AssetRepo {
	return &AssetRepo{db: db}
}

func (r *AssetRepo) UpsertByFileKey(ctx context.Context, asset *model.Asset) error {
	sqlStr := `
		INSERT INTO assets (
			id, user_id, file_key, url, name, content_type, size,
			status, last_error, locked_until, ctime, mtime
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (user_id, file_key)
		DO UPDATE SET
			url = EXCLUDED.url,
			name = EXCLUDED.name,
			content_type = EXCLUDED.content_type,
			size = EXCLUDED.size,
			status = EXCLUDED.status,
			last_error = EXCLUDED.last_error,
			locked_until = EXCLUDED.locked_until,
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
		asset.Status,
		asset.LastError,
		asset.LockedUntil,
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

func (r *AssetRepo) MarkReady(
	ctx context.Context, userID, fileKey string, now int64,
) error {
	return r.updateUploadStatus(
		ctx, userID, fileKey, model.AssetStatusPending,
		model.AssetStatusReady, "", now,
	)
}

func (r *AssetRepo) MarkFailed(
	ctx context.Context, userID, fileKey, stableError string, now int64,
) error {
	return r.updateUploadStatus(
		ctx, userID, fileKey, model.AssetStatusPending,
		model.AssetStatusFailed, stableError, now,
	)
}

func (r *AssetRepo) updateUploadStatus(
	ctx context.Context, userID, fileKey string,
	from, to model.AssetStatus, stableError string, now int64,
) error {
	const query = `
		UPDATE assets
		SET status = $1,
			last_error = LEFT($2, 500),
			locked_until = 0,
			mtime = $3
		WHERE user_id = $4 AND file_key = $5 AND status = $6
	`
	result, err := conn(ctx, r.db).ExecContext(
		ctx, query, to, stableError, now, userID, fileKey, from,
	)
	if err != nil {
		return fmt.Errorf("update asset upload status: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("update asset upload status rows affected: %w", err)
	}
	if affected != 1 {
		return appErr.ErrConflict
	}
	return nil
}

func (r *AssetRepo) ClaimCleanup(
	ctx context.Context, now, cutoff, lockedUntil int64,
) (*model.Asset, error) {
	const query = `
		WITH candidate AS (
			SELECT id
			FROM assets
			WHERE status IN ('pending', 'failed')
			  AND locked_until <= $1
			  AND mtime < $2
			ORDER BY mtime, id
			FOR UPDATE SKIP LOCKED
			LIMIT 1
		)
		UPDATE assets asset
		SET locked_until = $3
		FROM candidate
		WHERE asset.id = candidate.id
		RETURNING asset.id, asset.user_id, asset.file_key, asset.url,
			asset.name, asset.content_type, asset.size, asset.status,
			asset.last_error, asset.locked_until, asset.ctime, asset.mtime
	`
	row := conn(ctx, r.db).QueryRowContext(ctx, query, now, cutoff, lockedUntil)
	var asset model.Asset
	if err := row.Scan(
		&asset.ID, &asset.UserID, &asset.FileKey, &asset.URL,
		&asset.Name, &asset.ContentType, &asset.Size, &asset.Status,
		&asset.LastError, &asset.LockedUntil, &asset.Ctime, &asset.Mtime,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, appErr.ErrNoWork
		}
		return nil, fmt.Errorf("claim asset cleanup: %w", err)
	}
	if !asset.Status.Valid() || asset.Status == model.AssetStatusReady {
		return nil, fmt.Errorf(
			"%w: status=%q asset=%s", errInvalidAssetState, asset.Status, asset.ID,
		)
	}
	return &asset, nil
}

func (r *AssetRepo) DeleteIfNotReady(ctx context.Context, assetID string) error {
	const query = `DELETE FROM assets WHERE id = $1 AND status IN ('pending', 'failed')`
	result, err := conn(ctx, r.db).ExecContext(ctx, query, assetID)
	if err != nil {
		return fmt.Errorf("delete failed asset: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("delete failed asset rows affected: %w", err)
	}
	if affected != 1 {
		return appErr.ErrConflict
	}
	return nil
}

func (r *AssetRepo) ReleaseCleanup(
	ctx context.Context, assetID, stableError string, now int64,
) error {
	const query = `
		UPDATE assets
		SET locked_until = 0,
			last_error = LEFT($1, 500),
			mtime = $2
		WHERE id = $3 AND status IN ('pending', 'failed')
	`
	if _, err := conn(ctx, r.db).ExecContext(
		ctx, query, stableError, now, assetID,
	); err != nil {
		return fmt.Errorf("release asset cleanup: %w", err)
	}
	return nil
}

func (r *AssetRepo) ListByUser(ctx context.Context, userID, query string, limit, offset uint) ([]model.Asset, error) {
	if limit == 0 || limit > 200 {
		limit = 20
	}
	sqlStr := `
		SELECT id, user_id, file_key, url, name, content_type, size, ctime, mtime
		FROM assets
		WHERE user_id = ? AND status = 'ready'
	`
	args := []any{userID}
	if query != "" {
		sqlStr += ` AND (name LIKE ? OR content_type LIKE ?)`
		like := "%" + query + "%"
		args = append(args, like, like)
	}
	sqlStr += ` ORDER BY mtime DESC`
	sqlStr += ` LIMIT ? OFFSET ?`
	args = append(args, limit, offset)
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
	sqlStr, args, err := builder.BuildSelect("assets", map[string]any{
		"id": assetID, "user_id": userID, "status": "ready",
	}, []string{
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
	return r.queryAssets(ctx, map[string]any{
		"user_id": userID, "file_key in": fileKeys, "status": "ready",
	})
}

func (r *AssetRepo) ListByURLs(ctx context.Context, userID string, urls []string) ([]model.Asset, error) {
	if len(urls) == 0 {
		return []model.Asset{}, nil
	}
	return r.queryAssets(ctx, map[string]any{
		"user_id": userID, "url in": urls, "status": "ready",
	})
}
