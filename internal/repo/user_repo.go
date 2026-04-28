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

type UserRepo struct {
	db *sql.DB
}

func NewUserRepo(db *sql.DB) *UserRepo {
	return &UserRepo{db: db}
}

func (r *UserRepo) Create(ctx context.Context, user *model.User) error {
	data := map[string]any{
		"id":            user.ID,
		"email":         user.Email,
		"password_hash": user.PasswordHash,
		"ctime":         user.Ctime,
		"mtime":         user.Mtime,
	}
	sqlStr, args, err := builder.BuildInsert("users", []map[string]any{data})
	if err != nil {
		return fmt.Errorf("build insert: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	_, err = conn(ctx, r.db).ExecContext(ctx, sqlStr, args...)
	if err != nil {
		if dbutil.IsConflict(err) {
			return appErr.ErrConflict
		}
		return fmt.Errorf("exec: %w", err)
	}
	return nil
}

func (r *UserRepo) getUser(ctx context.Context, where map[string]any) (*model.User, error) {
	cols := []string{"id", "email", "password_hash", "ctime", "mtime"}
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
	if err := rows.Scan(&user.ID, &user.Email, &user.PasswordHash, &user.Ctime, &user.Mtime); err != nil {
		return nil, fmt.Errorf("scan: %w", err)
	}
	return &user, nil
}

func (r *UserRepo) GetByEmail(ctx context.Context, email string) (*model.User, error) {
	return r.getUser(ctx, map[string]any{"email": email})
}

func (r *UserRepo) GetByID(ctx context.Context, userID string) (*model.User, error) {
	return r.getUser(ctx, map[string]any{"id": userID})
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
