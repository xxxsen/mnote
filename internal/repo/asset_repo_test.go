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

func TestAssetRepo_UpsertByFileKey(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewAssetRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 1))

	err = r.UpsertByFileKey(context.Background(), &model.Asset{
		ID: "a1", UserID: "u1", FileKey: "fk1", URL: "http://x", Name: "f.png",
		ContentType: "image/png", Size: 100, Ctime: 1000, Mtime: 2000,
	})
	require.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestAssetRepo_UpsertByFileKey_Error(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewAssetRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(assert.AnError)

	err = r.UpsertByFileKey(context.Background(), &model.Asset{ID: "a1", UserID: "u1"})
	assert.Error(t, err)
}

func TestAssetRepo_ListByUser(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewAssetRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "file_key", "url", "name", "content_type", "size", "ctime", "mtime"}).
		AddRow("a1", "u1", "fk1", "http://x", "f.png", "image/png", int64(100), int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	items, err := r.ListByUser(context.Background(), "u1", "", 10, 0)
	require.NoError(t, err)
	require.Len(t, items, 1)
	assert.Equal(t, "a1", items[0].ID)
}

func TestAssetRepo_ListByUser_WithQuery(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewAssetRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "file_key", "url", "name", "content_type", "size", "ctime", "mtime"})
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	items, err := r.ListByUser(context.Background(), "u1", "png", 10, 0)
	require.NoError(t, err)
	assert.Empty(t, items)
}

func TestAssetRepo_GetByID(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewAssetRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "file_key", "url", "name", "content_type", "size", "ctime", "mtime"}).
		AddRow("a1", "u1", "fk1", "http://x", "f.png", "image/png", int64(100), int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	item, err := r.GetByID(context.Background(), "u1", "a1")
	require.NoError(t, err)
	assert.Equal(t, "a1", item.ID)
	assert.Equal(t, "fk1", item.FileKey)
}

func TestAssetRepo_GetByID_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewAssetRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "file_key", "url", "name", "content_type", "size", "ctime", "mtime"})
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	_, err = r.GetByID(context.Background(), "u1", "missing")
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestAssetRepo_ListByFileKeys(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewAssetRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "file_key", "url", "name", "content_type", "size", "ctime", "mtime"}).
		AddRow("a1", "u1", "fk1", "http://x", "f.png", "image/png", int64(100), int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	items, err := r.ListByFileKeys(context.Background(), "u1", []string{"fk1"})
	require.NoError(t, err)
	assert.Len(t, items, 1)
}

func TestAssetRepo_ListByFileKeys_Empty(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewAssetRepo(db)
	items, err := r.ListByFileKeys(context.Background(), "u1", nil)
	require.NoError(t, err)
	assert.Empty(t, items)
}

func TestAssetRepo_ListByURLs(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewAssetRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "file_key", "url", "name", "content_type", "size", "ctime", "mtime"}).
		AddRow("a1", "u1", "fk1", "http://x", "f.png", "image/png", int64(100), int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	items, err := r.ListByURLs(context.Background(), "u1", []string{"http://x"})
	require.NoError(t, err)
	assert.Len(t, items, 1)
}

func TestAssetRepo_ListByURLs_Empty(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewAssetRepo(db)
	items, err := r.ListByURLs(context.Background(), "u1", nil)
	require.NoError(t, err)
	assert.Empty(t, items)
}

func TestAssetRepo_ListByUser_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewAssetRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListByUser(context.Background(), "u1", "", 10, 0)
	assert.Error(t, err)
}

func TestAssetRepo_ListByUser_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewAssetRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("a1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByUser(context.Background(), "u1", "", 10, 0)
	assert.Error(t, err)
}

func TestAssetRepo_GetByID_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewAssetRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.GetByID(context.Background(), "u1", "a1")
	assert.Error(t, err)
}

func TestAssetRepo_GetByID_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewAssetRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("a1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetByID(context.Background(), "u1", "a1")
	assert.Error(t, err)
}

func TestAssetRepo_QueryAssets_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewAssetRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListByFileKeys(context.Background(), "u1", []string{"fk1"})
	assert.Error(t, err)
}

func TestAssetRepo_QueryAssets_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewAssetRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("a1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByFileKeys(context.Background(), "u1", []string{"fk1"})
	assert.Error(t, err)
}

func TestAssetRepo_ListByUser_NoLimit(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewAssetRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "file_key", "url", "name", "content_type", "size", "ctime", "mtime"}).
		AddRow("a1", "u1", "fk1", "http://x", "f.png", "image/png", int64(100), int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	items, err := r.ListByUser(context.Background(), "u1", "", 0, 0)
	require.NoError(t, err)
	assert.Len(t, items, 1)
}

func TestAssetRepo_ListByUser_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewAssetRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "file_key", "url", "name", "content_type", "size", "ctime", "mtime"}).
		AddRow("a1", "u1", "fk1", "http://x", "f.png", "image/png", int64(100), int64(1000), int64(2000)).
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByUser(context.Background(), "u1", "", 10, 0)
	assert.Error(t, err)
}

func TestAssetRepo_GetByID_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewAssetRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "file_key", "url", "name", "content_type", "size", "ctime", "mtime"}).
		CloseError(errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetByID(context.Background(), "u1", "a1")
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}

func TestAssetRepo_QueryAssets_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewAssetRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "file_key", "url", "name", "content_type", "size", "ctime", "mtime"}).
		AddRow("a1", "u1", "fk1", "http://x", "f.png", "image/png", int64(100), int64(1000), int64(2000)).
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByFileKeys(context.Background(), "u1", []string{"fk1"})
	assert.Error(t, err)
}
