package repo

import (
	"context"
	"database/sql"

	"github.com/didi/gendry/builder"

	"github.com/xxxsen/mnote/internal/pkg/dbutil"
)

type DocumentAssetReference struct {
	DocumentID string
	Title      string
	Mtime      int64
}

type DocumentAssetRepo struct {
	db *sql.DB
}

func NewDocumentAssetRepo(db *sql.DB) *DocumentAssetRepo {
	return &DocumentAssetRepo{db: db}
}

func (r *DocumentAssetRepo) ReplaceByDocument(ctx context.Context, userID, docID string, assetIDs []string, now int64) error {
	sqlDelete, deleteArgs := dbutil.Finalize("DELETE FROM document_assets WHERE user_id=? AND document_id=?", []interface{}{userID, docID})
	if _, err := r.db.ExecContext(ctx, sqlDelete, deleteArgs...); err != nil {
		return err
	}
	for _, assetID := range assetIDs {
		sqlStr, args, err := builder.BuildInsert("document_assets", []map[string]interface{}{{
			"user_id":     userID,
			"document_id": docID,
			"asset_id":    assetID,
			"ctime":       now,
		}})
		if err != nil {
			return err
		}
		sqlStr, args = dbutil.Finalize(sqlStr, args)
		if _, err := r.db.ExecContext(ctx, sqlStr, args...); err != nil {
			return err
		}
	}
	return nil
}

func (r *DocumentAssetRepo) DeleteByDocument(ctx context.Context, userID, docID string) error {
	sqlStr, args, err := builder.BuildDelete("document_assets", map[string]interface{}{"user_id": userID, "document_id": docID})
	if err != nil {
		return err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	_, err = r.db.ExecContext(ctx, sqlStr, args...)
	return err
}

func (r *DocumentAssetRepo) CountByAsset(ctx context.Context, userID, assetID string) (int, error) {
	sqlStr, args := dbutil.Finalize("SELECT COUNT(*) FROM document_assets WHERE user_id=? AND asset_id=?", []interface{}{userID, assetID})
	row := r.db.QueryRowContext(ctx, sqlStr, args...)
	count := 0
	if err := row.Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func (r *DocumentAssetRepo) CountByAssets(ctx context.Context, userID string, assetIDs []string) (map[string]int, error) {
	counts := make(map[string]int)
	if len(assetIDs) == 0 {
		return counts, nil
	}
	sqlStr, args, err := builder.BuildSelect("document_assets", map[string]interface{}{"user_id": userID, "asset_id in": assetIDs}, []string{"asset_id", "COUNT(*) AS cnt"})
	if err != nil {
		return nil, err
	}
	sqlStr += " GROUP BY asset_id"
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var assetID string
		var cnt int
		if err := rows.Scan(&assetID, &cnt); err != nil {
			return nil, err
		}
		counts[assetID] = cnt
	}
	return counts, rows.Err()
}

func (r *DocumentAssetRepo) ListReferences(ctx context.Context, userID, assetID string) ([]DocumentAssetReference, error) {
	sqlStr := `
		SELECT d.id, d.title, d.mtime
		FROM document_assets da
		JOIN documents d ON d.id = da.document_id AND d.user_id = da.user_id
		WHERE da.user_id = ? AND da.asset_id = ? AND d.state = 1
		ORDER BY d.mtime DESC
	`
	args := []interface{}{userID, assetID}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]DocumentAssetReference, 0)
	for rows.Next() {
		var item DocumentAssetReference
		if err := rows.Scan(&item.DocumentID, &item.Title, &item.Mtime); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
