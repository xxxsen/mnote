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

type UserRepo struct {
	db *sql.DB
}

func NewUserRepo(db *sql.DB) *UserRepo {
	return &UserRepo{db: db}
}

func (r *UserRepo) Create(ctx context.Context, user *model.User) error {
	return insertRecord(ctx, r.db, "users", map[string]any{
		"id":               user.ID,
		"email":            user.Email,
		"email_normalized": user.EmailNormalized,
		"password_hash":    user.PasswordHash,
		"ctime":            user.Ctime,
		"mtime":            user.Mtime,
	})
}

func (r *UserRepo) getUser(ctx context.Context, where map[string]any) (*model.User, error) {
	cols := []string{"id", "email", "COALESCE(email_normalized, '')", "password_hash", "ctime", "mtime"}
	sqlStr, args, err := builder.BuildSelect("users", where, cols)
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
	var user model.User
	if err := rows.Scan(
		&user.ID, &user.Email, &user.EmailNormalized,
		&user.PasswordHash, &user.Ctime, &user.Mtime,
	); err != nil {
		return nil, fmt.Errorf("scan: %w", err)
	}
	return &user, nil
}

func (r *UserRepo) GetByEmail(ctx context.Context, email string) (*model.User, error) {
	return r.getUser(ctx, map[string]any{"email": email})
}

func (r *UserRepo) GetByNormalizedEmail(ctx context.Context, normalized string) (*model.User, error) {
	return r.getUser(ctx, map[string]any{"email_normalized": normalized})
}

func (r *UserRepo) GetLegacyByExactEmail(ctx context.Context, trimmed string) (*model.User, error) {
	const query = `
		SELECT id, email, COALESCE(email_normalized, ''), password_hash, ctime, mtime
		FROM users
		WHERE email_normalized IS NULL AND BTRIM(email) = $1
	`
	return r.scanUserRow(conn(ctx, r.db).QueryRowContext(ctx, query, trimmed))
}

func (r *UserRepo) HasCanonicalEmail(ctx context.Context, normalized string) (bool, error) {
	const query = `SELECT EXISTS (SELECT 1 FROM users WHERE LOWER(BTRIM(email)) = $1)`
	var exists bool
	if err := conn(ctx, r.db).QueryRowContext(ctx, query, normalized).Scan(&exists); err != nil {
		return false, fmt.Errorf("query canonical email: %w", err)
	}
	return exists, nil
}

func (r *UserRepo) GetByID(ctx context.Context, userID string) (*model.User, error) {
	return r.getUser(ctx, map[string]any{"id": userID})
}

func (r *UserRepo) GetByIDForUpdate(ctx context.Context, userID string) (*model.User, error) {
	const query = `
		SELECT id, email, COALESCE(email_normalized, ''), password_hash, ctime, mtime
		FROM users
		WHERE id = $1
		FOR UPDATE
	`
	return r.scanUserRow(conn(ctx, r.db).QueryRowContext(ctx, query, userID))
}

func (r *UserRepo) scanUserRow(row *sql.Row) (*model.User, error) {
	var user model.User
	if err := row.Scan(
		&user.ID, &user.Email, &user.EmailNormalized,
		&user.PasswordHash, &user.Ctime, &user.Mtime,
	); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, appErr.ErrNotFound
		}
		return nil, fmt.Errorf("scan user: %w", err)
	}
	return &user, nil
}

func (r *UserRepo) UpdatePassword(ctx context.Context, userID, passwordHash string, mtime int64) error {
	where := map[string]any{"id": userID}
	update := map[string]any{
		"password_hash": passwordHash,
		"mtime":         mtime,
	}
	sqlStr, args, err := builder.BuildUpdate("users", where, update)
	if err != nil {
		return fmt.Errorf("build update: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	result, err := conn(ctx, r.db).ExecContext(ctx, sqlStr, args...)
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("exec: %w", err)
	}
	if affected == 0 {
		return appErr.ErrNotFound
	}
	return nil
}
