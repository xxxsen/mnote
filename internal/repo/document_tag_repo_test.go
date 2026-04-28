package repo

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
)

func TestDocumentTagRepo_Add(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentTagRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 1))

	err = r.Add(context.Background(), &model.DocumentTag{
		UserID: "u1", DocumentID: "d1", TagID: "t1",
	})
	require.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestDocumentTagRepo_Add_Error(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentTagRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(assert.AnError)

	err = r.Add(context.Background(), &model.DocumentTag{UserID: "u1"})
	assert.Error(t, err)
}

func TestDocumentTagRepo_DeleteByDoc(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentTagRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnResult(sqlmock.NewResult(0, 2))

	err = r.DeleteByDoc(context.Background(), "u1", "d1")
	require.NoError(t, err)
}

func TestDocumentTagRepo_DeleteByTag(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentTagRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnResult(sqlmock.NewResult(0, 3))

	err = r.DeleteByTag(context.Background(), "u1", "t1")
	require.NoError(t, err)
}

func TestDocumentTagRepo_ListTagIDs(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentTagRepo(db)
	rows := sqlmock.NewRows([]string{"tag_id"}).AddRow("t1").AddRow("t2")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	ids, err := r.ListTagIDs(context.Background(), "u1", "d1")
	require.NoError(t, err)
	assert.Equal(t, []string{"t1", "t2"}, ids)
}

func TestDocumentTagRepo_ListDocIDsByTag(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentTagRepo(db)
	rows := sqlmock.NewRows([]string{"document_id"}).AddRow("d1").AddRow("d2")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	ids, err := r.ListDocIDsByTag(context.Background(), "u1", "t1")
	require.NoError(t, err)
	assert.Equal(t, []string{"d1", "d2"}, ids)
}

func TestDocumentTagRepo_ListByUser(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentTagRepo(db)
	rows := sqlmock.NewRows([]string{"user_id", "document_id", "tag_id"}).
		AddRow("u1", "d1", "t1").
		AddRow("u1", "d2", "t2")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	items, err := r.ListByUser(context.Background(), "u1")
	require.NoError(t, err)
	assert.Len(t, items, 2)
}

func TestDocumentTagRepo_ListTagIDsByDocIDs(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentTagRepo(db)
	rows := sqlmock.NewRows([]string{"document_id", "tag_id"}).
		AddRow("d1", "t1").
		AddRow("d1", "t2").
		AddRow("d2", "t3")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	result, err := r.ListTagIDsByDocIDs(context.Background(), "u1", []string{"d1", "d2"})
	require.NoError(t, err)
	assert.Equal(t, []string{"t1", "t2"}, result["d1"])
	assert.Equal(t, []string{"t3"}, result["d2"])
}

func TestDocumentTagRepo_ListTagIDsByDocIDs_Empty(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentTagRepo(db)
	result, err := r.ListTagIDsByDocIDs(context.Background(), "u1", nil)
	require.NoError(t, err)
	assert.Empty(t, result)
}

func TestDocumentTagRepo_DeleteByDoc_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentTagRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnError(errDB)
	err = r.DeleteByDoc(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentTagRepo_DeleteByTag_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentTagRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnError(errDB)
	err = r.DeleteByTag(context.Background(), "u1", "t1")
	assert.Error(t, err)
}

func TestDocumentTagRepo_QueryStringColumn_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentTagRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListTagIDs(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentTagRepo_QueryStringColumn_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentTagRepo(db)
	rows := sqlmock.NewRows([]string{"a", "b"}).AddRow("t1", "extra")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListTagIDs(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentTagRepo_ListByUser_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentTagRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListByUser(context.Background(), "u1")
	assert.Error(t, err)
}

func TestDocumentTagRepo_ListByUser_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentTagRepo(db)
	rows := sqlmock.NewRows([]string{"user_id"}).AddRow("u1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByUser(context.Background(), "u1")
	assert.Error(t, err)
}

func TestDocumentTagRepo_ListTagIDsByDocIDs_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentTagRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListTagIDsByDocIDs(context.Background(), "u1", []string{"d1"})
	assert.Error(t, err)
}

func TestDocumentTagRepo_ListTagIDsByDocIDs_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentTagRepo(db)
	rows := sqlmock.NewRows([]string{"doc_id"}).AddRow("d1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListTagIDsByDocIDs(context.Background(), "u1", []string{"d1"})
	assert.Error(t, err)
}

func TestDocumentTagRepo_QueryStringColumn_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentTagRepo(db)
	rows := sqlmock.NewRows([]string{"tag_id"}).
		AddRow("t1").
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListTagIDs(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentTagRepo_ListByUser_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentTagRepo(db)
	rows := sqlmock.NewRows([]string{"user_id", "document_id", "tag_id"}).
		AddRow("u1", "d1", "t1").
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByUser(context.Background(), "u1")
	assert.Error(t, err)
}

func TestDocumentTagRepo_ListTagIDsByDocIDs_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentTagRepo(db)
	rows := sqlmock.NewRows([]string{"document_id", "tag_id"}).
		AddRow("d1", "t1").
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListTagIDsByDocIDs(context.Background(), "u1", []string{"d1"})
	assert.Error(t, err)
}
