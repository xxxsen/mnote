package repo

import (
	"context"
	"database/sql"
	"strings"

	"github.com/didi/gendry/builder"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/dbutil"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

const (
	ShareStateActive  = 1
	ShareStateRevoked = 2

	SharePermissionView    = 1
	SharePermissionComment = 2

	ShareCommentStateNormal = 1
)

type ShareRepo struct {
	db *sql.DB
}

func NewShareRepo(db *sql.DB) *ShareRepo {
	return &ShareRepo{db: db}
}

func (r *ShareRepo) Create(ctx context.Context, share *model.Share) error {
	data := map[string]interface{}{
		"id":             share.ID,
		"user_id":        share.UserID,
		"document_id":    share.DocumentID,
		"token":          share.Token,
		"state":          share.State,
		"expires_at":     share.ExpiresAt,
		"password_hash":  share.PasswordHash,
		"permission":     share.Permission,
		"allow_download": share.AllowDownload,
		"ctime":          share.Ctime,
		"mtime":          share.Mtime,
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

func (r *ShareRepo) UpdateConfigByDocument(ctx context.Context, userID, docID string, expiresAt int64, passwordHash string, permission int, allowDownload int, mtime int64) error {
	where := map[string]interface{}{"user_id": userID, "document_id": docID, "state": ShareStateActive}
	update := map[string]interface{}{
		"expires_at":     expiresAt,
		"password_hash":  passwordHash,
		"permission":     permission,
		"allow_download": allowDownload,
		"mtime":          mtime,
	}
	sqlStr, args, err := builder.BuildUpdate("shares", where, update)
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
	sqlStr, args, err := builder.BuildSelect("shares", where, []string{"id", "user_id", "document_id", "token", "state", "expires_at", "password_hash", "permission", "allow_download", "ctime", "mtime"})
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
	if err := rows.Scan(&share.ID, &share.UserID, &share.DocumentID, &share.Token, &share.State, &share.ExpiresAt, &share.PasswordHash, &share.Permission, &share.AllowDownload, &share.Ctime, &share.Mtime); err != nil {
		return nil, err
	}
	share.Password = share.PasswordHash
	share.HasPassword = strings.TrimSpace(share.PasswordHash) != ""
	return &share, nil
}

func (r *ShareRepo) GetActiveByDocument(ctx context.Context, userID, docID string) (*model.Share, error) {
	where := map[string]interface{}{
		"user_id":     userID,
		"document_id": docID,
		"state":       ShareStateActive,
	}
	sqlStr, args, err := builder.BuildSelect("shares", where, []string{"id", "user_id", "document_id", "token", "state", "expires_at", "password_hash", "permission", "allow_download", "ctime", "mtime"})
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
	if err := rows.Scan(&share.ID, &share.UserID, &share.DocumentID, &share.Token, &share.State, &share.ExpiresAt, &share.PasswordHash, &share.Permission, &share.AllowDownload, &share.Ctime, &share.Mtime); err != nil {
		return nil, err
	}
	share.Password = share.PasswordHash
	share.HasPassword = strings.TrimSpace(share.PasswordHash) != ""
	return &share, nil
}

type SharedDocument struct {
	ID            string
	Title         string
	Summary       string
	Mtime         int64
	Token         string
	ExpiresAt     int64
	Permission    int
	AllowDownload int
}

func (r *ShareRepo) ListActiveDocuments(ctx context.Context, userID string, query string) ([]SharedDocument, error) {
	sqlStr := `
		SELECT d.id, d.title, COALESCE(ds.summary, '') AS summary, d.mtime, s.token, s.expires_at, s.permission, s.allow_download
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
		if err := rows.Scan(&item.ID, &item.Title, &item.Summary, &item.Mtime, &item.Token, &item.ExpiresAt, &item.Permission, &item.AllowDownload); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *ShareRepo) CreateComment(ctx context.Context, comment *model.ShareComment) error {
	data := map[string]interface{}{
		"id":          comment.ID,
		"share_id":    comment.ShareID,
		"document_id": comment.DocumentID,
		"root_id":     comment.RootID,
		"reply_to_id": comment.ReplyToID,
		"author":      comment.Author,
		"content":     comment.Content,
		"state":       comment.State,
		"ctime":       comment.Ctime,
		"mtime":       comment.Mtime,
	}
	sqlStr, args, err := builder.BuildInsert("share_comments", []map[string]interface{}{data})
	if err != nil {
		return err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	_, err = r.db.ExecContext(ctx, sqlStr, args...)
	return err
}

func (r *ShareRepo) ListCommentsByShare(ctx context.Context, shareID string, limit, offset int) ([]model.ShareComment, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	where := map[string]interface{}{
		"share_id": shareID,
		"state":    ShareCommentStateNormal,
		"root_id":  "",
		"_orderby": "ctime desc",
		"_limit":   []uint{uint(offset), uint(limit)},
	}
	sqlStr, args, err := builder.BuildSelect("share_comments", where, []string{
		"id", "share_id", "document_id", "root_id", "reply_to_id", "author", "content", "state", "ctime", "mtime",
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
	items := make([]model.ShareComment, 0)
	for rows.Next() {
		var item model.ShareComment
		if err := rows.Scan(
			&item.ID,
			&item.ShareID,
			&item.DocumentID,
			&item.RootID,
			&item.ReplyToID,
			&item.Author,
			&item.Content,
			&item.State,
			&item.Ctime,
			&item.Mtime,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *ShareRepo) GetCommentByID(ctx context.Context, commentID string) (*model.ShareComment, error) {
	where := map[string]interface{}{
		"id":    commentID,
		"state": ShareCommentStateNormal,
	}
	sqlStr, args, err := builder.BuildSelect("share_comments", where, []string{
		"id", "share_id", "document_id", "root_id", "reply_to_id", "author", "content", "state", "ctime", "mtime",
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
	var item model.ShareComment
	if err := rows.Scan(
		&item.ID,
		&item.ShareID,
		&item.DocumentID,
		&item.RootID,
		&item.ReplyToID,
		&item.Author,
		&item.Content,
		&item.State,
		&item.Ctime,
		&item.Mtime,
	); err != nil {
		return nil, err
	}
	return &item, nil
}

func (r *ShareRepo) ListRepliesByRootIDs(ctx context.Context, shareID string, rootIDs []string) ([]model.ShareComment, error) {
	if len(rootIDs) == 0 {
		return []model.ShareComment{}, nil
	}
	where := map[string]interface{}{
		"share_id":   shareID,
		"state":      ShareCommentStateNormal,
		"root_id in": rootIDs,
		"_orderby":   "ctime asc", // Replies are usually oldest first
	}
	sqlStr, args, err := builder.BuildSelect("share_comments", where, []string{
		"id", "share_id", "document_id", "root_id", "reply_to_id", "author", "content", "state", "ctime", "mtime",
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
	items := make([]model.ShareComment, 0)
	for rows.Next() {
		var item model.ShareComment
		if err := rows.Scan(
			&item.ID,
			&item.ShareID,
			&item.DocumentID,
			&item.RootID,
			&item.ReplyToID,
			&item.Author,
			&item.Content,
			&item.State,
			&item.Ctime,
			&item.Mtime,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *ShareRepo) CountRepliesByRootIDs(ctx context.Context, shareID string, rootIDs []string) (map[string]int, error) {
	if len(rootIDs) == 0 {
		return map[string]int{}, nil
	}
	query := `SELECT root_id, COUNT(*) FROM share_comments WHERE share_id = ? AND state = ? AND root_id IN (`
	args := []interface{}{shareID, ShareCommentStateNormal}
	for i, id := range rootIDs {
		if i > 0 {
			query += ","
		}
		query += "?"
		args = append(args, id)
	}
	query += ") GROUP BY root_id"

	query, args = dbutil.Finalize(query, args)
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := make(map[string]int)
	for rows.Next() {
		var rootID string
		var count int
		if err := rows.Scan(&rootID, &count); err != nil {
			return nil, err
		}
		counts[rootID] = count
	}
	return counts, nil
}

func (r *ShareRepo) ListRepliesByRootID(ctx context.Context, shareID, rootID string, limit, offset int) ([]model.ShareComment, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	where := map[string]interface{}{
		"share_id": shareID,
		"root_id":  rootID,
		"state":    ShareCommentStateNormal,
		"_orderby": "ctime asc",
		"_limit":   []uint{uint(offset), uint(limit)},
	}
	sqlStr, args, err := builder.BuildSelect("share_comments", where, []string{
		"id", "share_id", "document_id", "root_id", "reply_to_id", "author", "content", "state", "ctime", "mtime",
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
	items := make([]model.ShareComment, 0)
	for rows.Next() {
		var item model.ShareComment
		if err := rows.Scan(
			&item.ID,
			&item.ShareID,
			&item.DocumentID,
			&item.RootID,
			&item.ReplyToID,
			&item.Author,
			&item.Content,
			&item.State,
			&item.Ctime,
			&item.Mtime,
		); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
