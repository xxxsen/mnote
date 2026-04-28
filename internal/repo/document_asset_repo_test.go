package repo

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDocumentAssetRepo_ReplaceByDocument(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentAssetRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(2, 1))

	err = r.ReplaceByDocument(context.Background(), "u1", "d1", []string{"a1", "a2"}, 1000)
	require.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestDocumentAssetRepo_ReplaceByDocument_Empty(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentAssetRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnResult(sqlmock.NewResult(0, 0))

	err = r.ReplaceByDocument(context.Background(), "u1", "d1", nil, 1000)
	require.NoError(t, err)
}

func TestDocumentAssetRepo_DeleteByDocument(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentAssetRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnResult(sqlmock.NewResult(0, 2))

	err = r.DeleteByDocument(context.Background(), "u1", "d1")
	require.NoError(t, err)
}

func TestDocumentAssetRepo_CountByAsset(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentAssetRepo(db)
	rows := sqlmock.NewRows([]string{"count"}).AddRow(3)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	count, err := r.CountByAsset(context.Background(), "u1", "a1")
	require.NoError(t, err)
	assert.Equal(t, 3, count)
}

func TestDocumentAssetRepo_CountByAssets(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentAssetRepo(db)
	rows := sqlmock.NewRows([]string{"asset_id", "cnt"}).
		AddRow("a1", 2).
		AddRow("a2", 1)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	counts, err := r.CountByAssets(context.Background(), "u1", []string{"a1", "a2"})
	require.NoError(t, err)
	assert.Equal(t, 2, counts["a1"])
	assert.Equal(t, 1, counts["a2"])
}

func TestDocumentAssetRepo_CountByAssets_Empty(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentAssetRepo(db)
	counts, err := r.CountByAssets(context.Background(), "u1", nil)
	require.NoError(t, err)
	assert.Empty(t, counts)
}

func TestDocumentAssetRepo_ListReferences(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentAssetRepo(db)
	rows := sqlmock.NewRows([]string{"id", "title", "mtime"}).
		AddRow("d1", "Doc Title", int64(1000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	refs, err := r.ListReferences(context.Background(), "u1", "a1")
	require.NoError(t, err)
	require.Len(t, refs, 1)
	assert.Equal(t, "d1", refs[0].DocumentID)
	assert.Equal(t, "Doc Title", refs[0].Title)
}

func TestDocumentAssetRepo_ReplaceByDocument_DeleteError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentAssetRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnError(errDB)
	err = r.ReplaceByDocument(context.Background(), "u1", "d1", []string{"a1"}, 1000)
	assert.Error(t, err)
}

func TestDocumentAssetRepo_ReplaceByDocument_InsertError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentAssetRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("INSERT INTO").WillReturnError(errDB)
	err = r.ReplaceByDocument(context.Background(), "u1", "d1", []string{"a1"}, 1000)
	assert.Error(t, err)
}

func TestDocumentAssetRepo_DeleteByDocument_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentAssetRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnError(errDB)
	err = r.DeleteByDocument(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentAssetRepo_CountByAsset_Error(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentAssetRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.CountByAsset(context.Background(), "u1", "a1")
	assert.Error(t, err)
}

func TestDocumentAssetRepo_CountByAssets_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentAssetRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.CountByAssets(context.Background(), "u1", []string{"a1"})
	assert.Error(t, err)
}

func TestDocumentAssetRepo_CountByAssets_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentAssetRepo(db)
	rows := sqlmock.NewRows([]string{"asset_id"}).AddRow("a1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.CountByAssets(context.Background(), "u1", []string{"a1"})
	assert.Error(t, err)
}

func TestDocumentAssetRepo_ListReferences_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentAssetRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListReferences(context.Background(), "u1", "a1")
	assert.Error(t, err)
}

func TestDocumentAssetRepo_ListReferences_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentAssetRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("d1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListReferences(context.Background(), "u1", "a1")
	assert.Error(t, err)
}

func TestDocumentAssetRepo_CountByAssets_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentAssetRepo(db)
	rows := sqlmock.NewRows([]string{"asset_id", "cnt"}).
		AddRow("a1", 2).
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.CountByAssets(context.Background(), "u1", []string{"a1"})
	assert.Error(t, err)
}

func TestDocumentAssetRepo_ListReferences_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentAssetRepo(db)
	rows := sqlmock.NewRows([]string{"id", "title", "mtime"}).
		AddRow("d1", "Title", int64(1000)).
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListReferences(context.Background(), "u1", "a1")
	assert.Error(t, err)
}
