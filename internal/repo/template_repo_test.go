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

var tplCols = []string{"id", "user_id", "name", "description", "content", "default_tag_ids_json", "ctime", "mtime"}

func TestTemplateRepo_Create(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 1))

	err = r.Create(context.Background(), &model.Template{
		ID: "tpl1", UserID: "u1", Name: "Note",
		Description: "desc", Content: "# Hello",
		DefaultTagIDs: []string{"t1"}, Ctime: 1000, Mtime: 1000,
	})
	require.NoError(t, err)
}

func TestTemplateRepo_Create_Conflict(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(errConflictStub)

	err = r.Create(context.Background(), &model.Template{ID: "tpl1", UserID: "u1"})
	assert.ErrorIs(t, err, appErr.ErrConflict)
}

func TestTemplateRepo_Update(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 1))

	err = r.Update(context.Background(), &model.Template{
		ID: "tpl1", UserID: "u1", Name: "Updated", Mtime: 2000,
	})
	require.NoError(t, err)
}

func TestTemplateRepo_Update_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 0))

	err = r.Update(context.Background(), &model.Template{ID: "missing", UserID: "u1"})
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestTemplateRepo_Delete(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnResult(sqlmock.NewResult(0, 1))

	err = r.Delete(context.Background(), "u1", "tpl1")
	require.NoError(t, err)
}

func TestTemplateRepo_Delete_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnResult(sqlmock.NewResult(0, 0))

	err = r.Delete(context.Background(), "u1", "missing")
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestTemplateRepo_GetByID(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	rows := sqlmock.NewRows(tplCols).
		AddRow("tpl1", "u1", "Note", "desc", "# Hello", `["t1"]`, int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	tpl, err := r.GetByID(context.Background(), "u1", "tpl1")
	require.NoError(t, err)
	assert.Equal(t, "tpl1", tpl.ID)
	assert.Equal(t, "Note", tpl.Name)
	assert.Equal(t, []string{"t1"}, tpl.DefaultTagIDs)
}

func TestTemplateRepo_GetByID_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	rows := sqlmock.NewRows(tplCols)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	_, err = r.GetByID(context.Background(), "u1", "missing")
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestTemplateRepo_ListByUser(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	rows := sqlmock.NewRows(tplCols).
		AddRow("tpl1", "u1", "Note1", "d1", "c1", `[]`, int64(1000), int64(2000)).
		AddRow("tpl2", "u1", "Note2", "d2", "c2", `["t1"]`, int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	items, err := r.ListByUser(context.Background(), "u1")
	require.NoError(t, err)
	assert.Len(t, items, 2)
}

func TestTemplateRepo_ListMetaByUser(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	metaCols := []string{"id", "user_id", "name", "description", "default_tag_ids_json", "ctime", "mtime"}
	rows := sqlmock.NewRows(metaCols).
		AddRow("tpl1", "u1", "Note1", "d1", `[]`, int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	items, err := r.ListMetaByUser(context.Background(), "u1", 10, 0)
	require.NoError(t, err)
	assert.Len(t, items, 1)
}

func TestTemplateRepo_CountByUser(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	rows := sqlmock.NewRows([]string{"count"}).AddRow(3)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	count, err := r.CountByUser(context.Background(), "u1")
	require.NoError(t, err)
	assert.Equal(t, 3, count)
}

func TestTemplateRepo_Create_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(errDB)
	err = r.Create(context.Background(), &model.Template{ID: "t1", UserID: "u1"})
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrConflict)
}

func TestTemplateRepo_Update_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	mock.ExpectExec("UPDATE").WillReturnError(errDB)
	err = r.Update(context.Background(), &model.Template{ID: "t1", UserID: "u1"})
	assert.Error(t, err)
}

func TestTemplateRepo_Delete_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnError(errDB)
	err = r.Delete(context.Background(), "u1", "t1")
	assert.Error(t, err)
}

func TestTemplateRepo_GetByID_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.GetByID(context.Background(), "u1", "t1")
	assert.Error(t, err)
}

func TestTemplateRepo_GetByID_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("t1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetByID(context.Background(), "u1", "t1")
	assert.Error(t, err)
}

func TestTemplateRepo_ListByUser_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListByUser(context.Background(), "u1")
	assert.Error(t, err)
}

func TestTemplateRepo_ListByUser_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("t1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByUser(context.Background(), "u1")
	assert.Error(t, err)
}

func TestTemplateRepo_ListMetaByUser_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListMetaByUser(context.Background(), "u1", 10, 0)
	assert.Error(t, err)
}

func TestTemplateRepo_ListMetaByUser_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("t1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListMetaByUser(context.Background(), "u1", 10, 0)
	assert.Error(t, err)
}

func TestTemplateRepo_CountByUser_Error(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.CountByUser(context.Background(), "u1")
	assert.Error(t, err)
}

func TestTemplateRepo_ListMetaByUser_NoLimit(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	metaCols := []string{"id", "user_id", "name", "description", "default_tag_ids_json", "ctime", "mtime"}
	rows := sqlmock.NewRows(metaCols).
		AddRow("t1", "u1", "Note", "desc", `[]`, int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	items, err := r.ListMetaByUser(context.Background(), "u1", 0, 0)
	require.NoError(t, err)
	assert.Len(t, items, 1)
}

func TestTemplateRepo_Delete_RowsAffectedError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnResult(sqlmock.NewErrorResult(errDB))
	err = r.Delete(context.Background(), "u1", "t1")
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}

func TestTemplateRepo_GetByID_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "name", "description", "content", "default_tag_ids_json", "ctime", "mtime"}).
		CloseError(errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetByID(context.Background(), "u1", "t1")
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}

func TestTemplateRepo_ListByUser_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "name", "description", "content", "default_tag_ids_json", "ctime", "mtime"}).
		AddRow("t1", "u1", "Note", "desc", "body", `[]`, int64(1000), int64(2000)).
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByUser(context.Background(), "u1")
	assert.Error(t, err)
}

func TestTemplateRepo_ListMetaByUser_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTemplateRepo(db)
	metaCols := []string{"id", "user_id", "name", "description", "default_tag_ids_json", "ctime", "mtime"}
	rows := sqlmock.NewRows(metaCols).
		AddRow("t1", "u1", "Note", "desc", `[]`, int64(1000), int64(2000)).
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListMetaByUser(context.Background(), "u1", 10, 0)
	assert.Error(t, err)
}
