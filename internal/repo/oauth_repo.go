package repo

import (
	"context"
	"database/sql"

	"github.com/didi/gendry/builder"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

type OAuthRepo struct {
	db *sql.DB
}

func NewOAuthRepo(db *sql.DB) *OAuthRepo {
	return &OAuthRepo{db: db}
}

func (r *OAuthRepo) Create(ctx context.Context, account *model.OAuthAccount) error {
	data := map[string]interface{}{
		"id":               account.ID,
		"user_id":          account.UserID,
		"provider":         account.Provider,
		"provider_user_id": account.ProviderUserID,
		"email":            account.Email,
		"ctime":            account.Ctime,
		"mtime":            account.Mtime,
	}
	sqlStr, args, err := builder.BuildInsert("oauth_accounts", []map[string]interface{}{data})
	if err != nil {
		return err
	}
	_, err = r.db.ExecContext(ctx, sqlStr, args...)
	return err
}

func (r *OAuthRepo) GetByProviderUserID(ctx context.Context, provider, providerUserID string) (*model.OAuthAccount, error) {
	where := map[string]interface{}{
		"provider":         provider,
		"provider_user_id": providerUserID,
	}
	sqlStr, args, err := builder.BuildSelect("oauth_accounts", where, []string{"id", "user_id", "provider", "provider_user_id", "email", "ctime", "mtime"})
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
	var account model.OAuthAccount
	if err := rows.Scan(&account.ID, &account.UserID, &account.Provider, &account.ProviderUserID, &account.Email, &account.Ctime, &account.Mtime); err != nil {
		return nil, err
	}
	return &account, nil
}

func (r *OAuthRepo) GetByUserProvider(ctx context.Context, userID, provider string) (*model.OAuthAccount, error) {
	where := map[string]interface{}{
		"user_id":  userID,
		"provider": provider,
	}
	sqlStr, args, err := builder.BuildSelect("oauth_accounts", where, []string{"id", "user_id", "provider", "provider_user_id", "email", "ctime", "mtime"})
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
	var account model.OAuthAccount
	if err := rows.Scan(&account.ID, &account.UserID, &account.Provider, &account.ProviderUserID, &account.Email, &account.Ctime, &account.Mtime); err != nil {
		return nil, err
	}
	return &account, nil
}

func (r *OAuthRepo) ListByUser(ctx context.Context, userID string) ([]model.OAuthAccount, error) {
	where := map[string]interface{}{"user_id": userID}
	sqlStr, args, err := builder.BuildSelect("oauth_accounts", where, []string{"id", "user_id", "provider", "provider_user_id", "email", "ctime", "mtime"})
	if err != nil {
		return nil, err
	}
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	accounts := make([]model.OAuthAccount, 0)
	for rows.Next() {
		var account model.OAuthAccount
		if err := rows.Scan(&account.ID, &account.UserID, &account.Provider, &account.ProviderUserID, &account.Email, &account.Ctime, &account.Mtime); err != nil {
			return nil, err
		}
		accounts = append(accounts, account)
	}
	return accounts, rows.Err()
}

func (r *OAuthRepo) CountByUser(ctx context.Context, userID string) (int, error) {
	sqlStr, args, err := builder.BuildSelect("oauth_accounts", map[string]interface{}{"user_id": userID}, []string{"COUNT(1)"})
	if err != nil {
		return 0, err
	}
	rows, err := r.db.QueryContext(ctx, sqlStr, args...)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	if !rows.Next() {
		return 0, nil
	}
	var count int
	if err := rows.Scan(&count); err != nil {
		return 0, err
	}
	return count, nil
}

func (r *OAuthRepo) DeleteByUserProvider(ctx context.Context, userID, provider string) error {
	where := map[string]interface{}{"user_id": userID, "provider": provider}
	sqlStr, args, err := builder.BuildDelete("oauth_accounts", where)
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
