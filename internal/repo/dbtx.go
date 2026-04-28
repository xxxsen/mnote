package repo

import (
	"context"
	"database/sql"
	"fmt"
)

type DBTX interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

type txKey struct{}

func WithTx(ctx context.Context, tx *sql.Tx) context.Context {
	return context.WithValue(ctx, txKey{}, tx)
}

func TxFromContext(ctx context.Context) *sql.Tx {
	tx, _ := ctx.Value(txKey{}).(*sql.Tx)
	return tx
}

func conn(ctx context.Context, fallback DBTX) DBTX {
	if tx := TxFromContext(ctx); tx != nil {
		return tx
	}
	return fallback
}

func beginOrJoin(ctx context.Context, db *sql.DB) (*sql.Tx, bool, error) {
	if tx := TxFromContext(ctx); tx != nil {
		return tx, false, nil
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, false, fmt.Errorf("begin transaction: %w", err)
	}
	return tx, true, nil
}

func RunInTx(ctx context.Context, db *sql.DB, fn func(ctx context.Context) error) error {
	if TxFromContext(ctx) != nil {
		return fn(ctx)
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	txCtx := WithTx(ctx, tx)
	if err := fn(txCtx); err != nil {
		_ = tx.Rollback()
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}
	return nil
}
