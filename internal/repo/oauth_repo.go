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

type OAuthRepo struct {
	db *sql.DB
}

func NewOAuthRepo(db *sql.DB) *OAuthRepo {
	return &OAuthRepo{db: db}
}

func (r *OAuthRepo) Create(ctx context.Context, account *model.OAuthAccount) error {
	return insertRow(ctx, conn(ctx, r.db), "oauth_accounts", map[string]any{
		"id":               account.ID,
		"user_id":          account.UserID,
		"provider":         account.Provider,
		"provider_user_id": account.ProviderUserID,
		"email":            account.Email,
		"ctime":            account.Ctime,
		"mtime":            account.Mtime,
	})
}

func (r *OAuthRepo) getOAuthAccount(ctx context.Context, where map[string]any) (*model.OAuthAccount, error) {
	cols := []string{
		"id", "user_id", "provider",
		"provider_user_id", "email", "ctime", "mtime",
	}
	sqlStr, args, err := builder.BuildSelect("oauth_accounts", where, cols)
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
	var account model.OAuthAccount
	if err := rows.Scan(
		&account.ID, &account.UserID, &account.Provider,
		&account.ProviderUserID, &account.Email,
		&account.Ctime, &account.Mtime,
	); err != nil {
		return nil, fmt.Errorf("scan: %w", err)
	}
	return &account, nil
}

func (r *OAuthRepo) GetByProviderUserID(
	ctx context.Context, provider, providerUserID string,
) (*model.OAuthAccount, error) {
	return r.getOAuthAccount(ctx, map[string]any{
		"provider": provider, "provider_user_id": providerUserID,
	})
}

func (r *OAuthRepo) GetByUserProvider(ctx context.Context, userID, provider string) (*model.OAuthAccount, error) {
	return r.getOAuthAccount(ctx, map[string]any{
		"user_id": userID, "provider": provider,
	})
}

func (r *OAuthRepo) ListByUser(ctx context.Context, userID string) ([]model.OAuthAccount, error) {
	where := map[string]any{"user_id": userID}
	sqlStr, args, err := builder.BuildSelect("oauth_accounts", where, []string{
		"id", "user_id", "provider",
		"provider_user_id", "email", "ctime", "mtime",
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
	accounts := make([]model.OAuthAccount, 0)
	for rows.Next() {
		var account model.OAuthAccount
		if err := rows.Scan(&account.ID, &account.UserID, &account.Provider, &account.ProviderUserID, &account.Email,
			&account.Ctime, &account.Mtime); err != nil {
			return nil, fmt.Errorf("scan: %w", err)
		}
		accounts = append(accounts, account)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate rows: %w", err)
	}
	return accounts, nil
}

func (r *OAuthRepo) CountByUser(ctx context.Context, userID string) (int, error) {
	sqlStr, args, err := builder.BuildSelect("oauth_accounts", map[string]any{"user_id": userID}, []string{"COUNT(1)"})
	if err != nil {
		return 0, fmt.Errorf("build select: %w", err)
	}
	sqlStr, args = dbutil.Finalize(sqlStr, args)
	rows, err := conn(ctx, r.db).QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return 0, fmt.Errorf("query: %w", err)
	}
	defer func() { _ = rows.Close() }()
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return 0, fmt.Errorf("query: %w", err)
		}
		return 0, nil
	}
	var count int
	if err := rows.Scan(&count); err != nil {
		return 0, fmt.Errorf("scan: %w", err)
	}
	return count, nil
}

func (r *OAuthRepo) DeleteByUserProvider(ctx context.Context, userID, provider string) error {
	where := map[string]any{"user_id": userID, "provider": provider}
	sqlStr, args, err := builder.BuildDelete("oauth_accounts", where)
	if err != nil {
		return fmt.Errorf("build delete: %w", err)
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
