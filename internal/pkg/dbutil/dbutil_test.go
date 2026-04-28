package dbutil

import (
	"context"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/lib/pq"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFinalize_NoLimit(t *testing.T) {
	q, args := Finalize("SELECT * FROM t WHERE id = ?", []any{1})
	assert.Equal(t, "SELECT * FROM t WHERE id = $1", q)
	assert.Equal(t, []any{1}, args)
}

func TestFinalize_WithLimit(t *testing.T) {
	q, args := Finalize("SELECT * FROM t WHERE id = ? LIMIT ?, ?", []any{1, 10, 20})
	assert.Equal(t, "SELECT * FROM t WHERE id = $1 LIMIT $2 OFFSET $3", q)
	assert.Equal(t, []any{1, 20, 10}, args)
}

func TestIsConflict_True(t *testing.T) {
	err := &pq.Error{Code: "23505"}
	assert.True(t, IsConflict(err))
}

func TestIsConflict_False(t *testing.T) {
	assert.False(t, IsConflict(errors.New("random error")))
	assert.False(t, IsConflict(&pq.Error{Code: "42601"}))
}

func TestExecAffected_Success(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	mock.ExpectExec("UPDATE t SET").
		WithArgs("val").
		WillReturnResult(sqlmock.NewResult(0, 3))

	affected, err := ExecAffected(context.Background(), db, "UPDATE t SET col = $1", []any{"val"})
	require.NoError(t, err)
	assert.Equal(t, int64(3), affected)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestExecAffected_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	mock.ExpectExec("UPDATE").WillReturnError(errors.New("connection lost"))

	_, err = ExecAffected(context.Background(), db, "UPDATE t SET col = $1", []any{"v"})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "exec")
}

func TestInsertWithConflictCheck_Success(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	mock.ExpectExec("INSERT INTO").
		WithArgs("a").
		WillReturnResult(sqlmock.NewResult(1, 1))

	err = InsertWithConflictCheck(context.Background(), db, "INSERT INTO t (c) VALUES ($1)", []any{"a"}, errors.New("conflict"))
	assert.NoError(t, err)
}

func TestInsertWithConflictCheck_Conflict(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	conflictErr := errors.New("duplicate key")
	mock.ExpectExec("INSERT INTO").
		WillReturnError(&pq.Error{Code: "23505"})

	err = InsertWithConflictCheck(context.Background(), db, "INSERT INTO t (c) VALUES ($1)", []any{"a"}, conflictErr)
	assert.ErrorIs(t, err, conflictErr)
}

func TestExecAffected_RowsAffectedError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	mock.ExpectExec("UPDATE").
		WillReturnResult(sqlmock.NewErrorResult(errors.New("rows affected err")))

	_, err = ExecAffected(context.Background(), db, "UPDATE t SET col = $1", []any{"v"})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "rows affected")
}

func TestInsertWithConflictCheck_OtherError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer db.Close()

	mock.ExpectExec("INSERT INTO").
		WillReturnError(errors.New("disk full"))

	err = InsertWithConflictCheck(context.Background(), db, "INSERT INTO t (c) VALUES ($1)", []any{"a"}, errors.New("conflict"))
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "exec")
}
