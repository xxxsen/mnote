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

var verCols = []string{"id", "user_id", "document_id", "version", "title", "content", "ctime"}

func TestVersionRepo_Create(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 1))

	err = r.Create(context.Background(), &model.DocumentVersion{
		ID: "v1", UserID: "u1", DocumentID: "d1",
		Version: 1, Title: "v1", Content: "c1", Ctime: 1000,
	})
	require.NoError(t, err)
}

func TestVersionRepo_GetLatestVersion(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	rows := sqlmock.NewRows([]string{"version"}).AddRow(3)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	ver, err := r.GetLatestVersion(context.Background(), "u1", "d1")
	require.NoError(t, err)
	assert.Equal(t, 3, ver)
}

func TestVersionRepo_GetLatestVersion_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	rows := sqlmock.NewRows([]string{"version"})
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	_, err = r.GetLatestVersion(context.Background(), "u1", "d1")
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestVersionRepo_List(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	rows := sqlmock.NewRows(verCols).
		AddRow("v2", "u1", "d1", 2, "title2", "c2", int64(2000)).
		AddRow("v1", "u1", "d1", 1, "title1", "c1", int64(1000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	versions, err := r.List(context.Background(), "u1", "d1")
	require.NoError(t, err)
	assert.Len(t, versions, 2)
	assert.Equal(t, 2, versions[0].Version)
}

func TestVersionRepo_ListSummaries(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	sumCols := []string{"id", "document_id", "version", "title", "ctime"}
	rows := sqlmock.NewRows(sumCols).
		AddRow("v1", "d1", 1, "title1", int64(1000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	summaries, err := r.ListSummaries(context.Background(), "u1", "d1")
	require.NoError(t, err)
	assert.Len(t, summaries, 1)
}

func TestVersionRepo_ListByUser(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	rows := sqlmock.NewRows(verCols).
		AddRow("v1", "u1", "d1", 1, "t1", "c1", int64(1000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	versions, err := r.ListByUser(context.Background(), "u1")
	require.NoError(t, err)
	assert.Len(t, versions, 1)
}

func TestVersionRepo_GetByVersion(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	rows := sqlmock.NewRows(verCols).
		AddRow("v1", "u1", "d1", 1, "title1", "content1", int64(1000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	v, err := r.GetByVersion(context.Background(), "u1", "d1", 1)
	require.NoError(t, err)
	assert.Equal(t, "v1", v.ID)
	assert.Equal(t, 1, v.Version)
}

func TestVersionRepo_GetByVersion_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	rows := sqlmock.NewRows(verCols)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	_, err = r.GetByVersion(context.Background(), "u1", "d1", 99)
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestVersionRepo_DeleteOldVersions(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnResult(sqlmock.NewResult(0, 3))

	err = r.DeleteOldVersions(context.Background(), "u1", "d1", 5)
	require.NoError(t, err)
}

func TestVersionRepo_DeleteOldVersions_KeepZero(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	err = r.DeleteOldVersions(context.Background(), "u1", "d1", 0)
	require.NoError(t, err)
}

func TestVersionRepo_Create_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(errDB)
	err = r.Create(context.Background(), &model.DocumentVersion{ID: "v1"})
	assert.Error(t, err)
}

func TestVersionRepo_GetLatestVersion_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.GetLatestVersion(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestVersionRepo_GetLatestVersion_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	rows := sqlmock.NewRows([]string{"version"}).AddRow("not_int")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetLatestVersion(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestVersionRepo_List_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.List(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestVersionRepo_List_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("v1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.List(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestVersionRepo_ListSummaries_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListSummaries(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestVersionRepo_ListSummaries_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("v1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListSummaries(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestVersionRepo_ListByUser_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListByUser(context.Background(), "u1")
	assert.Error(t, err)
}

func TestVersionRepo_ListByUser_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("v1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByUser(context.Background(), "u1")
	assert.Error(t, err)
}

func TestVersionRepo_GetByVersion_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.GetByVersion(context.Background(), "u1", "d1", 1)
	assert.Error(t, err)
}

func TestVersionRepo_GetByVersion_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("v1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetByVersion(context.Background(), "u1", "d1", 1)
	assert.Error(t, err)
}

func TestVersionRepo_DeleteOldVersions_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnError(errDB)
	err = r.DeleteOldVersions(context.Background(), "u1", "d1", 5)
	assert.Error(t, err)
}

func TestVersionRepo_List_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "document_id", "version", "title", "content", "ctime"}).
		AddRow("v1", "u1", "d1", 1, "Title", "Content", int64(1000)).
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.List(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestVersionRepo_ListSummaries_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	rows := sqlmock.NewRows([]string{"id", "document_id", "version", "title", "ctime"}).
		AddRow("v1", "d1", 1, "Title", int64(1000)).
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListSummaries(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestVersionRepo_ListByUser_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "document_id", "version", "title", "content", "ctime"}).
		AddRow("v1", "u1", "d1", 1, "Title", "Content", int64(1000)).
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByUser(context.Background(), "u1")
	assert.Error(t, err)
}

func TestVersionRepo_GetLatestVersion_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	rows := sqlmock.NewRows([]string{"version"}).CloseError(errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetLatestVersion(context.Background(), "u1", "d1")
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}

func TestVersionRepo_GetByVersion_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewVersionRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "document_id", "version", "title", "content", "ctime"}).
		CloseError(errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetByVersion(context.Background(), "u1", "d1", 1)
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}
