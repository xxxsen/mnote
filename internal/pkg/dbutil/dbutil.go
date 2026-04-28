package dbutil

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/jmoiron/sqlx"
	"github.com/lib/pq"
)

var limitRegex = regexp.MustCompile(`(?i)LIMIT\s+\?\s*,\s*\?`)

func Finalize(query string, args []any) (string, []any) {
	loc := limitRegex.FindStringIndex(query)
	if loc != nil {
		prefix := query[:loc[0]]
		qCount := strings.Count(prefix, "?")
		if qCount+1 < len(args) {
			args[qCount], args[qCount+1] = args[qCount+1], args[qCount]
			query = limitRegex.ReplaceAllString(query, "LIMIT ? OFFSET ?")
		}
	}
	return sqlx.Rebind(sqlx.DOLLAR, query), args
}

func IsConflict(err error) bool {
	pgErr := &pq.Error{}
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return false
}

type Executor interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func ExecAffected(ctx context.Context, db Executor, sqlStr string, args []any) (int64, error) {
	result, err := db.ExecContext(ctx, sqlStr, args...)
	if err != nil {
		return 0, fmt.Errorf("exec: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("rows affected: %w", err)
	}
	return affected, nil
}

func InsertWithConflictCheck(
	ctx context.Context, db Executor, sqlStr string, args []any,
	conflictErr error,
) error {
	_, err := db.ExecContext(ctx, sqlStr, args...)
	if err != nil {
		if IsConflict(err) {
			return conflictErr
		}
		return fmt.Errorf("exec: %w", err)
	}
	return nil
}
