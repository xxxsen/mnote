package repo

import (
	"context"
	"database/sql"

	"github.com/didi/gendry/builder"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/dbutil"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

type EmailVerificationRepo struct {
	db *sql.DB
}

func NewEmailVerificationRepo(db *sql.DB) *EmailVerificationRepo {
	return &EmailVerificationRepo{db: db}
}

func (r *EmailVerificationRepo) Create(ctx context.Context, code *model.EmailVerificationCode) error {
	data := map[string]interface{}{
		"id":         code.ID,
		"email":      code.Email,
		"purpose":    code.Purpose,
		"code_hash":  code.CodeHash,
		"used":       code.Used,
		"ctime":      code.Ctime,
		"expires_at": code.ExpiresAt,
	}
	sqlStr, args, err := builder.BuildInsert("email_verification_codes", []map[string]interface{}{data})
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

func (r *EmailVerificationRepo) LatestByEmail(ctx context.Context, email, purpose string) (*model.EmailVerificationCode, error) {
	where := map[string]interface{}{"email": email, "purpose": purpose, "_orderby": "ctime desc", "_limit": []uint{0, 1}}
	sqlStr, args, err := builder.BuildSelect("email_verification_codes", where, []string{"id", "email", "purpose", "code_hash", "used", "ctime", "expires_at"})
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
	var code model.EmailVerificationCode
	if err := rows.Scan(&code.ID, &code.Email, &code.Purpose, &code.CodeHash, &code.Used, &code.Ctime, &code.ExpiresAt); err != nil {
		return nil, err
	}
	return &code, nil
}

func (r *EmailVerificationRepo) MarkUsed(ctx context.Context, id string) error {
	where := map[string]interface{}{"id": id}
	update := map[string]interface{}{"used": 1}
	sqlStr, args, err := builder.BuildUpdate("email_verification_codes", where, update)
	if err != nil {
		return err
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
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
