package repo

import (
	"context"
	"database/sql"

	"github.com/didi/gendry/builder"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/dbutil"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

const (
	ShareStateActive  = 1
	ShareStateRevoked = 2
)

type ShareRepo struct {
	db *sql.DB
}

func NewShareRepo(db *sql.DB) *ShareRepo {
	return &ShareRepo{db: db}
}

func (r *ShareRepo) Create(ctx context.Context, share *model.Share) error {
	data := map[string]interface{}{
		"id":          share.ID,
		"user_id":     share.UserID,
		"document_id": share.DocumentID,
		"token":       share.Token,
		"state":       share.State,
		"ctime":       share.Ctime,
		"mtime":       share.Mtime,
	}
	sqlStr, args, err := builder.BuildInsert("shares", []map[string]interface{}{data})
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

func (r *ShareRepo) RevokeByDocument(ctx context.Context, userID, docID string, mtime int64) error {
	where := map[string]interface{}{"user_id": userID, "document_id": docID, "state": ShareStateActive}
	update := map[string]interface{}{"state": ShareStateRevoked, "mtime": mtime}
	sqlStr, args, err := builder.BuildUpdate("shares", where, update)
	if err != nil {
		return err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	_, err = r.db.ExecContext(ctx, sqlStr, args...)
	return err
}

func (r *ShareRepo) GetByToken(ctx context.Context, token string) (*model.Share, error) {
	where := map[string]interface{}{"token": token}
	sqlStr, args, err := builder.BuildSelect("shares", where, []string{"id", "user_id", "document_id", "token", "state", "ctime", "mtime"})
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
	var share model.Share
	if err := rows.Scan(&share.ID, &share.UserID, &share.DocumentID, &share.Token, &share.State, &share.Ctime, &share.Mtime); err != nil {
		return nil, err
	}
	return &share, nil
}

func (r *ShareRepo) GetActiveByDocument(ctx context.Context, userID, docID string) (*model.Share, error) {
	where := map[string]interface{}{
		"user_id":     userID,
		"document_id": docID,
		"state":       ShareStateActive,
	}
	sqlStr, args, err := builder.BuildSelect("shares", where, []string{"id", "user_id", "document_id", "token", "state", "ctime", "mtime"})
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
	var share model.Share
	if err := rows.Scan(&share.ID, &share.UserID, &share.DocumentID, &share.Token, &share.State, &share.Ctime, &share.Mtime); err != nil {
		return nil, err
	}
	return &share, nil
}

type SharedDocument struct {
	ID      string
	Title   string
	Summary string
	Mtime   int64
	Token   string
}

func (r *ShareRepo) ListActiveDocuments(ctx context.Context, userID string, query string) ([]SharedDocument, error) {
	sqlStr := `
		SELECT d.id, d.title, COALESCE(ds.summary, '') AS summary, d.mtime, s.token
		FROM shares s
		JOIN documents d ON d.id = s.document_id AND d.user_id = s.user_id
		LEFT JOIN document_summaries ds ON ds.document_id = d.id AND ds.user_id = d.user_id
		WHERE s.user_id = ? AND s.state = ? AND d.state = ?
	`
	args := []interface{}{userID, ShareStateActive, 1}
	if query != "" {
		sqlStr += " AND (d.title LIKE ? OR d.content LIKE ?)"
		like := "%" + query + "%"
		args = append(args, like, like)
	}
	sqlStr += " ORDER BY d.mtime DESC"

	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]SharedDocument, 0)
	for rows.Next() {
		var item SharedDocument
		if err := rows.Scan(&item.ID, &item.Title, &item.Summary, &item.Mtime, &item.Token); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
