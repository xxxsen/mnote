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

type EmailVerificationRepo struct {
	db *sql.DB
}

func NewEmailVerificationRepo(db *sql.DB) *EmailVerificationRepo {
	return &EmailVerificationRepo{db: db}
}

func (r *EmailVerificationRepo) Create(ctx context.Context, code *model.EmailVerificationCode) error {
	return insertRow(ctx, conn(ctx, r.db), "email_verification_codes", map[string]any{
		"id":         code.ID,
		"email":      code.Email,
		"purpose":    code.Purpose,
		"code_hash":  code.CodeHash,
		"used":       code.Used,
		"status":     code.Status,
		"ctime":      code.Ctime,
		"expires_at": code.ExpiresAt,
	})
}

func (
	r *EmailVerificationRepo) LatestByEmail(ctx context.Context,
	email,
	purpose string) (*model.EmailVerificationCode,
	error,
) {
	where := map[string]any{
		"email": email, "purpose": purpose, "status": "sent",
		"_orderby": "ctime desc", "_limit": []uint{0, 1},
	}
	sqlStr, args, err := builder.BuildSelect("email_verification_codes", where, []string{
		"id", "email", "purpose",
		"code_hash", "used", "status", "ctime", "expires_at",
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
	var code model.EmailVerificationCode
	if err := rows.Scan(
		&code.ID, &code.Email, &code.Purpose, &code.CodeHash,
		&code.Used, &code.Status, &code.Ctime, &code.ExpiresAt,
	); err != nil {
		return nil, fmt.Errorf("scan: %w", err)
	}
	return &code, nil
}

func (r *EmailVerificationRepo) MarkStatus(ctx context.Context, id, status string) error {
	where := map[string]any{"id": id}
	update := map[string]any{"status": status}
	sqlStr, args, err := builder.BuildUpdate("email_verification_codes", where, update)
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

func (r *EmailVerificationRepo) ConsumeIfUnused(ctx context.Context, id string, now int64) error {
	const query = `
		UPDATE email_verification_codes
		SET used = 1
		WHERE id = $1
		  AND used = 0
		  AND status = 'sent'
		  AND expires_at > $2
	`
	result, err := conn(ctx, r.db).ExecContext(ctx, query, id, now)
	if err != nil {
		return fmt.Errorf("consume verification code: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("consume verification code: %w", err)
	}
	if affected != 1 {
		return appErr.ErrConflict
	}
	return nil
}

// MarkUsed remains as a compatibility wrapper for internal callers while
// registration uses ConsumeIfUnused with the current timestamp.
func (r *EmailVerificationRepo) MarkUsed(ctx context.Context, id string) error {
	return r.ConsumeIfUnused(ctx, id, 0)
}
