package repo

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

func TestInsertRow(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 1))

	err = insertRow(context.Background(), db, "test_table", map[string]any{
		"id":   "1",
		"name": "test",
	})
	require.NoError(t, err)
}

func TestInsertRow_Conflict(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	mock.ExpectExec("INSERT INTO").WillReturnError(errConflictStub)

	err = insertRow(context.Background(), db, "test_table", map[string]any{
		"id":   "1",
		"name": "test",
	})
	assert.ErrorIs(t, err, appErr.ErrConflict)
}

func TestQueryBasicDocuments(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	rows := sqlmock.NewRows([]string{"id", "user_id", "title", "content"}).
		AddRow("d1", "u1", "Title1", "Content1").
		AddRow("d2", "u1", "Title2", "Content2")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	docs, err := queryBasicDocuments(context.Background(), db, "SELECT id, user_id, title, content FROM documents WHERE user_id = $1", "u1")
	require.NoError(t, err)
	assert.Len(t, docs, 2)
	assert.Equal(t, "d1", docs[0].ID)
}

func TestQueryBasicDocuments_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	mock.ExpectQuery("SELECT").WillReturnError(assert.AnError)

	_, err = queryBasicDocuments(context.Background(), db, "SELECT id, user_id, title, content FROM documents", nil)
	assert.Error(t, err)
}

func TestQueryBasicDocuments_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	rows := sqlmock.NewRows([]string{"id"}).AddRow("d1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	_, err = queryBasicDocuments(context.Background(), db, "SELECT id FROM documents")
	assert.Error(t, err)
}

func TestQueryBasicDocuments_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	rows := sqlmock.NewRows([]string{"id", "user_id", "title", "content"}).
		AddRow("d1", "u1", "Title1", "Content1").
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	_, err = queryBasicDocuments(context.Background(), db, "SELECT id, user_id, title, content FROM documents")
	assert.Error(t, err)
}

func TestInsertRow_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	mock.ExpectExec("INSERT INTO").WillReturnError(errDB)

	err = insertRow(context.Background(), db, "test_table", map[string]any{
		"id":   "1",
		"name": "test",
	})
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrConflict)
}
