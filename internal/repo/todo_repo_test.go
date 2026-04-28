package repo

import (
	"context"
	"database/sql"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

func TestTodoRepo_Create(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTodoRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 1))
	err = r.Create(context.Background(), &model.Todo{
		ID: "t1", UserID: "u1", Content: "task", DueDate: "2026-01-01",
	})
	require.NoError(t, err)
}

func TestTodoRepo_Create_Conflict(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTodoRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(errConflictStub)
	err = r.Create(context.Background(), &model.Todo{ID: "t1"})
	assert.ErrorIs(t, err, appErr.ErrConflict)
}

func TestTodoRepo_Update(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTodoRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 1))
	err = r.Update(context.Background(), &model.Todo{
		ID: "t1", UserID: "u1", Content: "updated",
	})
	require.NoError(t, err)
}

func TestTodoRepo_Update_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTodoRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 0))
	err = r.Update(context.Background(), &model.Todo{ID: "t1", UserID: "u1"})
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestTodoRepo_UpdateDone(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTodoRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 1))
	err = r.UpdateDone(context.Background(), "u1", "t1", 1, 1000)
	require.NoError(t, err)
}

func TestTodoRepo_UpdateDone_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTodoRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 0))
	err = r.UpdateDone(context.Background(), "u1", "t1", 1, 1000)
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestTodoRepo_GetByID(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTodoRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "content", "due_date", "done", "ctime", "mtime"}).
		AddRow("t1", "u1", "task", "2026-01-01", 0, int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	todo, err := r.GetByID(context.Background(), "u1", "t1")
	require.NoError(t, err)
	assert.Equal(t, "t1", todo.ID)
	assert.Equal(t, "task", todo.Content)
}

func TestTodoRepo_GetByID_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTodoRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(sql.ErrNoRows)
	_, err = r.GetByID(context.Background(), "u1", "missing")
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestTodoRepo_ListByDateRange(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTodoRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "content", "due_date", "done", "ctime", "mtime"}).
		AddRow("t1", "u1", "task1", "2026-01-01", 0, int64(1000), int64(2000)).
		AddRow("t2", "u1", "task2", "2026-01-02", 1, int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	items, err := r.ListByDateRange(context.Background(), "u1", "2026-01-01", "2026-01-31")
	require.NoError(t, err)
	assert.Len(t, items, 2)
}

func TestTodoRepo_Delete(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTodoRepo(db)
	mock.ExpectExec("DELETE").WillReturnResult(sqlmock.NewResult(0, 1))
	err = r.Delete(context.Background(), "u1", "t1")
	require.NoError(t, err)
}

func TestTodoRepo_Delete_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTodoRepo(db)
	mock.ExpectExec("DELETE").WillReturnResult(sqlmock.NewResult(0, 0))
	err = r.Delete(context.Background(), "u1", "t1")
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestTodoRepo_Create_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTodoRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(errDB)
	err = r.Create(context.Background(), &model.Todo{ID: "t1", UserID: "u1"})
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrConflict)
}

func TestTodoRepo_Update_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTodoRepo(db)
	mock.ExpectExec("UPDATE").WillReturnError(errDB)
	err = r.Update(context.Background(), &model.Todo{ID: "t1", UserID: "u1"})
	assert.Error(t, err)
}

func TestTodoRepo_UpdateDone_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTodoRepo(db)
	mock.ExpectExec("UPDATE").WillReturnError(errDB)
	err = r.UpdateDone(context.Background(), "u1", "t1", 1, 1000)
	assert.Error(t, err)
}

func TestTodoRepo_GetByID_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTodoRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.GetByID(context.Background(), "u1", "t1")
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}

func TestTodoRepo_ListByDateRange_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTodoRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListByDateRange(context.Background(), "u1", "2026-01-01", "2026-01-31")
	assert.Error(t, err)
}

func TestTodoRepo_ListByDateRange_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTodoRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("t1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByDateRange(context.Background(), "u1", "2026-01-01", "2026-01-31")
	assert.Error(t, err)
}

func TestTodoRepo_Delete_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTodoRepo(db)
	mock.ExpectExec("DELETE").WillReturnError(errDB)
	err = r.Delete(context.Background(), "u1", "t1")
	assert.Error(t, err)
}

func TestTodoRepo_Update_RowsAffectedError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTodoRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewErrorResult(errDB))
	err = r.Update(context.Background(), &model.Todo{ID: "t1", UserID: "u1"})
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}

func TestTodoRepo_Delete_RowsAffectedError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTodoRepo(db)
	mock.ExpectExec("DELETE").WillReturnResult(sqlmock.NewErrorResult(errDB))
	err = r.Delete(context.Background(), "u1", "t1")
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}

func TestTodoRepo_ListByDateRange_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTodoRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "content", "due_date", "done", "ctime", "mtime"}).
		AddRow("t1", "u1", "task", "2026-01-15", 0, int64(1000), int64(2000)).
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByDateRange(context.Background(), "u1", "2026-01-01", "2026-01-31")
	assert.Error(t, err)
}
