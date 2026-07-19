package repo

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/didi/gendry/builder"

	"github.com/xxxsen/mnote/internal/pkg/dbutil"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

type DBTX interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

type txKey struct{}

type Transactor struct {
	db *sql.DB
}

func NewTransactor(db *sql.DB) *Transactor {
	if db == nil {
		panic("repo.NewTransactor: db must not be nil")
	}
	return &Transactor{db: db}
}

func (t *Transactor) WithinTransaction(ctx context.Context, fn func(context.Context) error) error {
	return RunInTx(ctx, t.db, fn)
}

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

func insertRecord(
	ctx context.Context, database DBTX, table string, data map[string]any,
) error {
	query, args, err := builder.BuildInsert(table, []map[string]any{data})
	if err != nil {
		return fmt.Errorf("build insert: %w", err)
	}
	query, args = dbutil.Finalize(query, args)
	if _, err := conn(ctx, database).ExecContext(ctx, query, args...); err != nil {
		if dbutil.IsConflict(err) {
			return appErr.ErrConflict
		}
		return fmt.Errorf("exec insert: %w", err)
	}
	return nil
}
