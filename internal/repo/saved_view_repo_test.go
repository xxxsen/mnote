package repo

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

func TestSavedViewRepo_Create(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewSavedViewRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 1))
	err = r.Create(context.Background(), &model.SavedView{
		ID: "v1", UserID: "u1", Name: "My View",
	})
	require.NoError(t, err)
}

func TestSavedViewRepo_Create_Conflict(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewSavedViewRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(errConflictStub)
	err = r.Create(context.Background(), &model.SavedView{ID: "v1"})
	assert.ErrorIs(t, err, appErr.ErrConflict)
}

func TestSavedViewRepo_List(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewSavedViewRepo(db)
	rows := sqlmock.NewRows([]string{
		"id", "user_id", "name", "search", "tag_id",
		"show_starred", "show_shared", "ctime", "mtime",
	}).AddRow("v1", "u1", "View", "", "", 0, 0, int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	items, err := r.List(context.Background(), "u1")
	require.NoError(t, err)
	assert.Len(t, items, 1)
	assert.Equal(t, "View", items[0].Name)
}

func TestSavedViewRepo_Delete(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewSavedViewRepo(db)
	mock.ExpectExec("DELETE").WillReturnResult(sqlmock.NewResult(0, 1))
	err = r.Delete(context.Background(), "u1", "v1")
	require.NoError(t, err)
}

func TestSavedViewRepo_Delete_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewSavedViewRepo(db)
	mock.ExpectExec("DELETE").WillReturnResult(sqlmock.NewResult(0, 0))
	err = r.Delete(context.Background(), "u1", "v1")
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestSavedViewRepo_List_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewSavedViewRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.List(context.Background(), "u1")
	assert.Error(t, err)
}

func TestSavedViewRepo_List_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewSavedViewRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("v1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.List(context.Background(), "u1")
	assert.Error(t, err)
}

func TestSavedViewRepo_Create_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewSavedViewRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(errDB)
	err = r.Create(context.Background(), &model.SavedView{ID: "v1", UserID: "u1"})
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrConflict)
}

func TestSavedViewRepo_Delete_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewSavedViewRepo(db)
	mock.ExpectExec("DELETE").WillReturnError(errDB)
	err = r.Delete(context.Background(), "u1", "v1")
	assert.Error(t, err)
}

func TestSavedViewRepo_List_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewSavedViewRepo(db)
	rows := sqlmock.NewRows([]string{
		"id", "user_id", "name", "search", "tag_id",
		"show_starred", "show_shared", "ctime", "mtime",
	}).AddRow("v1", "u1", "View", "", "", 0, 0, int64(1000), int64(2000)).
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.List(context.Background(), "u1")
	assert.Error(t, err)
}

func TestSavedViewRepo_Delete_RowsAffectedError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewSavedViewRepo(db)
	mock.ExpectExec("DELETE").WillReturnResult(sqlmock.NewErrorResult(errDB))
	err = r.Delete(context.Background(), "u1", "v1")
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}
