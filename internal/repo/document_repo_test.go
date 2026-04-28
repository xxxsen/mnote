package repo

import (
	"context"
	"fmt"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

var docCols = []string{"id", "user_id", "title", "content", "state", "pinned", "starred", "ctime", "mtime"}

func addDocRow(rows *sqlmock.Rows, id, title string) *sqlmock.Rows {
	return rows.AddRow(id, "u1", title, "content", 1, 0, 0, int64(1000), int64(2000))
}

func TestDocumentRepo_Create(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 1))

	err = r.Create(context.Background(), &model.Document{
		ID: "d1", UserID: "u1", Title: "Hello", Content: "World",
		State: 1, Ctime: 1000, Mtime: 1000,
	})
	require.NoError(t, err)
}

func TestDocumentRepo_Create_Conflict(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(errConflictStub)

	err = r.Create(context.Background(), &model.Document{ID: "d1", UserID: "u1"})
	assert.ErrorIs(t, err, appErr.ErrConflict)
}

func TestDocumentRepo_Update(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 1))

	err = r.Update(context.Background(), &model.Document{
		ID: "d1", UserID: "u1", Title: "Updated", Content: "New", Mtime: 2000,
	})
	require.NoError(t, err)
}

func TestDocumentRepo_Update_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 0))

	err = r.Update(context.Background(), &model.Document{ID: "d1", UserID: "u1"})
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestDocumentRepo_GetByID(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	rows := addDocRow(sqlmock.NewRows(docCols), "d1", "Hello")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	doc, err := r.GetByID(context.Background(), "u1", "d1")
	require.NoError(t, err)
	assert.Equal(t, "d1", doc.ID)
	assert.Equal(t, "Hello", doc.Title)
}

func TestDocumentRepo_GetByID_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	rows := sqlmock.NewRows(docCols)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	_, err = r.GetByID(context.Background(), "u1", "missing")
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestDocumentRepo_GetByTitle(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	rows := addDocRow(sqlmock.NewRows(docCols), "d1", "Hello")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	doc, err := r.GetByTitle(context.Background(), "u1", "Hello")
	require.NoError(t, err)
	assert.Equal(t, "Hello", doc.Title)
}

func TestDocumentRepo_List(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	rows := addDocRow(sqlmock.NewRows(docCols), "d1", "Doc1")
	addDocRow(rows, "d2", "Doc2")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	docs, err := r.List(context.Background(), "u1", nil, 10, 0, "")
	require.NoError(t, err)
	assert.Len(t, docs, 2)
}

func TestDocumentRepo_Count(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	rows := sqlmock.NewRows([]string{"count"}).AddRow(42)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	count, err := r.Count(context.Background(), "u1", nil)
	require.NoError(t, err)
	assert.Equal(t, 42, count)
}

func TestDocumentRepo_Delete(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 1))

	err = r.Delete(context.Background(), "u1", "d1", 3000)
	require.NoError(t, err)
}

func TestDocumentRepo_Delete_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 0))

	err = r.Delete(context.Background(), "u1", "d1", 3000)
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestDocumentRepo_TouchMtime(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 1))

	err = r.TouchMtime(context.Background(), "u1", "d1", 5000)
	require.NoError(t, err)
}

func TestDocumentRepo_UpdatePinned(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 1))

	err = r.UpdatePinned(context.Background(), "u1", "d1", 1)
	require.NoError(t, err)
}

func TestDocumentRepo_UpdateStarred(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 1))

	err = r.UpdateStarred(context.Background(), "u1", "d1", 1)
	require.NoError(t, err)
}

func TestDocumentRepo_SearchLike(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	rows := addDocRow(sqlmock.NewRows(docCols), "d1", "Hello World")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	docs, err := r.SearchLike(context.Background(), "u1", "Hello", "", nil, 10, 0, "")
	require.NoError(t, err)
	assert.Len(t, docs, 1)
}

func TestDocumentRepo_ListByIDs(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	rows := addDocRow(sqlmock.NewRows(docCols), "d1", "Doc1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	docs, err := r.ListByIDs(context.Background(), "u1", []string{"d1"})
	require.NoError(t, err)
	assert.Len(t, docs, 1)
}

func TestDocumentRepo_ListByIDs_Empty(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	docs, err := r.ListByIDs(context.Background(), "u1", nil)
	require.NoError(t, err)
	assert.Empty(t, docs)
}

func TestDocumentRepo_UpdateLinks(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectBegin()
	mock.ExpectExec("DELETE FROM").WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 2))
	mock.ExpectCommit()

	err = r.UpdateLinks(context.Background(), "u1", "d1", []string{"d2", "d3"}, 1000)
	require.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestDocumentRepo_UpdateLinks_NoTargets(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectBegin()
	mock.ExpectExec("DELETE FROM").WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectCommit()

	err = r.UpdateLinks(context.Background(), "u1", "d1", nil, 1000)
	require.NoError(t, err)
}

func TestDocumentRepo_GetBacklinks(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	rows := addDocRow(sqlmock.NewRows(docCols), "d2", "Backlink Source")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	docs, err := r.GetBacklinks(context.Background(), "u1", "d1")
	require.NoError(t, err)
	assert.Len(t, docs, 1)
	assert.Equal(t, "d2", docs[0].ID)
}

func TestBuildLinkInserts(t *testing.T) {
	inserts := buildLinkInserts("s1", "u1", []string{"t1", "t2", "t1", "s1"}, 1000)
	assert.Len(t, inserts, 2)
}

func TestBuildLinkInserts_Empty(t *testing.T) {
	inserts := buildLinkInserts("s1", "u1", nil, 1000)
	assert.Empty(t, inserts)
}

var errDB = fmt.Errorf("db error")

func TestDocumentRepo_Create_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(errDB)
	err = r.Create(context.Background(), &model.Document{ID: "d1", UserID: "u1"})
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrConflict)
}

func TestDocumentRepo_Update_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectExec("UPDATE").WillReturnError(errDB)
	err = r.Update(context.Background(), &model.Document{ID: "d1", UserID: "u1"})
	assert.Error(t, err)
}

func TestDocumentRepo_UpdateDocField_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectExec("UPDATE").WillReturnError(errDB)
	err = r.TouchMtime(context.Background(), "u1", "d1", 5000)
	assert.Error(t, err)
}

func TestDocumentRepo_GetByID_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.GetByID(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentRepo_GetByID_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("d1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetByID(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentRepo_GetByTitle_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.GetByTitle(context.Background(), "u1", "Hello")
	assert.Error(t, err)
}

func TestDocumentRepo_GetByTitle_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectQuery("SELECT").WillReturnRows(sqlmock.NewRows(docCols))
	_, err = r.GetByTitle(context.Background(), "u1", "missing")
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestDocumentRepo_GetByTitle_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("d1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetByTitle(context.Background(), "u1", "Hello")
	assert.Error(t, err)
}

func TestDocumentRepo_List_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.List(context.Background(), "u1", nil, 10, 0, "")
	assert.Error(t, err)
}

func TestDocumentRepo_List_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("d1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.List(context.Background(), "u1", nil, 10, 0, "")
	assert.Error(t, err)
}

func TestDocumentRepo_ListByIDs_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListByIDs(context.Background(), "u1", []string{"d1"})
	assert.Error(t, err)
}

func TestDocumentRepo_ListByIDs_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("d1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByIDs(context.Background(), "u1", []string{"d1"})
	assert.Error(t, err)
}

func TestDocumentRepo_Count_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.Count(context.Background(), "u1", nil)
	assert.Error(t, err)
}

func TestDocumentRepo_Count_WithStarred(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	starred := 1
	rows := sqlmock.NewRows([]string{"count"}).AddRow(5)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	count, err := r.Count(context.Background(), "u1", &starred)
	require.NoError(t, err)
	assert.Equal(t, 5, count)
}

func TestDocumentRepo_SearchLike_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.SearchLike(context.Background(), "u1", "q", "", nil, 10, 0, "")
	assert.Error(t, err)
}

func TestDocumentRepo_SearchLike_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("d1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.SearchLike(context.Background(), "u1", "q", "", nil, 10, 0, "")
	assert.Error(t, err)
}

func TestDocumentRepo_SearchLike_WithTagAndStarred(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	starred := 1
	rows := addDocRow(sqlmock.NewRows(docCols), "d1", "Result")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	docs, err := r.SearchLike(context.Background(), "u1", "q", "tag1", &starred, 10, 0, "mtime desc")
	require.NoError(t, err)
	assert.Len(t, docs, 1)
}

func TestDocumentRepo_Delete_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectExec("UPDATE").WillReturnError(errDB)
	err = r.Delete(context.Background(), "u1", "d1", 3000)
	assert.Error(t, err)
}

func TestDocumentRepo_UpdateLinks_BeginError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectBegin().WillReturnError(errDB)
	err = r.UpdateLinks(context.Background(), "u1", "d1", []string{"d2"}, 1000)
	assert.Error(t, err)
}

func TestDocumentRepo_UpdateLinks_DeleteError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectBegin()
	mock.ExpectExec("DELETE FROM").WillReturnError(errDB)
	mock.ExpectRollback()
	err = r.UpdateLinks(context.Background(), "u1", "d1", []string{"d2"}, 1000)
	assert.Error(t, err)
}

func TestDocumentRepo_UpdateLinks_InsertError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectBegin()
	mock.ExpectExec("DELETE FROM").WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("INSERT INTO").WillReturnError(errDB)
	mock.ExpectRollback()
	err = r.UpdateLinks(context.Background(), "u1", "d1", []string{"d2"}, 1000)
	assert.Error(t, err)
}

func TestDocumentRepo_UpdateLinks_CommitError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectBegin()
	mock.ExpectExec("DELETE FROM").WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit().WillReturnError(errDB)
	err = r.UpdateLinks(context.Background(), "u1", "d1", []string{"d2"}, 1000)
	assert.Error(t, err)
}

func TestDocumentRepo_GetBacklinks_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.GetBacklinks(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentRepo_GetBacklinks_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("d2")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetBacklinks(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentRepo_List_WithStarredAndOrder(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	starred := 1
	rows := addDocRow(sqlmock.NewRows(docCols), "d1", "Doc1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	docs, err := r.List(context.Background(), "u1", &starred, 10, 5, "mtime desc")
	require.NoError(t, err)
	assert.Len(t, docs, 1)
}

func TestDocumentRepo_Update_RowsAffectedError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewErrorResult(errDB))
	err = r.Update(context.Background(), &model.Document{ID: "d1", UserID: "u1"})
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}

func TestDocumentRepo_UpdateDocField_RowsAffectedError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewErrorResult(errDB))
	err = r.TouchMtime(context.Background(), "u1", "d1", 3000)
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}

func TestDocumentRepo_UpdateDocField_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 0))
	err = r.UpdatePinned(context.Background(), "u1", "d1", 1)
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestDocumentRepo_Delete_RowsAffectedError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewErrorResult(errDB))
	err = r.Delete(context.Background(), "u1", "d1", 1000)
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}

func TestDocumentRepo_List_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	rows := addDocRow(sqlmock.NewRows(docCols), "d1", "Doc1").RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.List(context.Background(), "u1", nil, 10, 0, "")
	assert.Error(t, err)
}

func TestDocumentRepo_ListByIDs_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	rows := addDocRow(sqlmock.NewRows(docCols), "d1", "Doc1").RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByIDs(context.Background(), "u1", []string{"d1"})
	assert.Error(t, err)
}

func TestDocumentRepo_SearchLike_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	rows := addDocRow(sqlmock.NewRows(docCols), "d1", "Doc1").RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.SearchLike(context.Background(), "u1", "test", "", nil, 10, 0, "")
	assert.Error(t, err)
}

func TestDocumentRepo_GetBacklinks_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	rows := addDocRow(sqlmock.NewRows(docCols), "d2", "Backlink").RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetBacklinks(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestDocumentRepo_GetByID_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	rows := sqlmock.NewRows(docCols).CloseError(errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetByID(context.Background(), "u1", "d1")
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}

func TestDocumentRepo_GetByTitle_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	rows := sqlmock.NewRows(docCols).CloseError(errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetByTitle(context.Background(), "u1", "Test")
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}

func TestDocumentRepo_SearchLike_WithAllFilters(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewDocumentRepo(db)
	starred := 1
	rows := addDocRow(sqlmock.NewRows(docCols), "d1", "Doc1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	docs, err := r.SearchLike(context.Background(), "u1", "test", "t1", &starred, 10, 0, "mtime desc")
	require.NoError(t, err)
	assert.Len(t, docs, 1)
}
