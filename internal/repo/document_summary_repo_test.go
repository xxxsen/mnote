package repo

import (
	"context"
	"database/sql"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

func TestDocumentSummaryRepo_Upsert(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentSummaryRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 1))

	err = r.Upsert(context.Background(), "u1", "d1", "summary text", 1000)
	require.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestDocumentSummaryRepo_Upsert_Error(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentSummaryRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(assert.AnError)

	err = r.Upsert(context.Background(), "u1", "d1", "summary", 1000)
	assert.Error(t, err)
}

func TestDocumentSummaryRepo_GetByDocID(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentSummaryRepo(db)
	rows := sqlmock.NewRows([]string{"summary"}).AddRow("hello summary")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	summary, err := r.GetByDocID(context.Background(), "u1", "d1")
	require.NoError(t, err)
	assert.Equal(t, "hello summary", summary)
}

func TestDocumentSummaryRepo_GetByDocID_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentSummaryRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(sql.ErrNoRows)

	_, err = r.GetByDocID(context.Background(), "u1", "d1")
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestDocumentSummaryRepo_ListByDocIDs(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentSummaryRepo(db)
	rows := sqlmock.NewRows([]string{"document_id", "summary"}).
		AddRow("d1", "sum1").
		AddRow("d2", "sum2")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	result, err := r.ListByDocIDs(context.Background(), "u1", []string{"d1", "d2"})
	require.NoError(t, err)
	assert.Equal(t, "sum1", result["d1"])
	assert.Equal(t, "sum2", result["d2"])
}

func TestDocumentSummaryRepo_ListByDocIDs_Empty(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentSummaryRepo(db)
	result, err := r.ListByDocIDs(context.Background(), "u1", nil)
	require.NoError(t, err)
	assert.Empty(t, result)
}

func TestDocumentSummaryRepo_ListPendingDocuments(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentSummaryRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "title", "content"}).
		AddRow("d1", "u1", "Title1", "Content1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	docs, err := r.ListPendingDocuments(context.Background(), 10, 99999)
	require.NoError(t, err)
	require.Len(t, docs, 1)
	assert.Equal(t, "d1", docs[0].ID)
}

func TestDocumentSummaryRepo_GetByDocID_Error(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentSummaryRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.GetByDocID(context.Background(), "u1", "d1")
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}

func TestDocumentSummaryRepo_ListByDocIDs_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentSummaryRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListByDocIDs(context.Background(), "u1", []string{"d1"})
	assert.Error(t, err)
}

func TestDocumentSummaryRepo_ListByDocIDs_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentSummaryRepo(db)
	rows := sqlmock.NewRows([]string{"doc_id"}).AddRow("d1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByDocIDs(context.Background(), "u1", []string{"d1"})
	assert.Error(t, err)
}

func TestDocumentSummaryRepo_ListPendingDocuments_Error(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentSummaryRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListPendingDocuments(context.Background(), 10, 99999)
	assert.Error(t, err)
}

func TestDocumentSummaryRepo_ListByDocIDs_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentSummaryRepo(db)
	rows := sqlmock.NewRows([]string{"document_id", "summary"}).
		AddRow("d1", "sum1").
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByDocIDs(context.Background(), "u1", []string{"d1"})
	assert.Error(t, err)
}

func TestDocumentSummaryRepo_ListPendingDocuments_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentSummaryRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("d1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListPendingDocuments(context.Background(), 10, 99999)
	assert.Error(t, err)
}
