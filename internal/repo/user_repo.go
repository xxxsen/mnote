package repo

import (
	"context"
	"database/sql"

	"github.com/didi/gendry/builder"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

type UserRepo struct {
	db *sql.DB
}

func NewUserRepo(db *sql.DB) *UserRepo {
	return &UserRepo{db: db}
}

func (r *UserRepo) Create(ctx context.Context, user *model.User) error {
	data := map[string]interface{}{
		"id":            user.ID,
		"email":         user.Email,
		"password_hash": user.PasswordHash,
		"ctime":         user.Ctime,
		"mtime":         user.Mtime,
	}
	sqlStr, args, err := builder.BuildInsert("users", []map[string]interface{}{data})
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, sqlStr, args...)
	return err
}

func (r *UserRepo) GetByEmail(ctx context.Context, email string) (*model.User, error) {
	where := map[string]interface{}{"email": email}
	sqlStr, args, err := builder.BuildSelect("users", where, []string{"id", "email", "password_hash", "ctime", "mtime"})
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
	var user model.User
	if err := rows.Scan(&user.ID, &user.Email, &user.PasswordHash, &user.Ctime, &user.Mtime); err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepo) GetByID(ctx context.Context, userID string) (*model.User, error) {
	where := map[string]interface{}{"id": userID}
	sqlStr, args, err := builder.BuildSelect("users", where, []string{"id", "email", "password_hash", "ctime", "mtime"})
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
	var user model.User
	if err := rows.Scan(&user.ID, &user.Email, &user.PasswordHash, &user.Ctime, &user.Mtime); err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepo) UpdatePassword(ctx context.Context, userID, passwordHash string, mtime int64) error {
	where := map[string]interface{}{"id": userID}
	update := map[string]interface{}{
		"password_hash": passwordHash,
		"mtime":         mtime,
	}
	sqlStr, args, err := builder.BuildUpdate("users", where, update)
	if err != nil {
		return err
	}
	result, err := r.db.ExecContext(ctx, sqlStr, args...)
	if err != nil {
		return err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return appErr.ErrNotFound
	}
	return nil
}
