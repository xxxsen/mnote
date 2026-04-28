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

var tagCols = []string{"id", "user_id", "name", "pinned", "ctime", "mtime"}

func addTagRow(rows *sqlmock.Rows, id, name string) *sqlmock.Rows {
	return rows.AddRow(id, "u1", name, 0, int64(1000), int64(2000))
}

func TestTagRepo_Create(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 1))

	err = r.Create(context.Background(), &model.Tag{
		ID: "t1", UserID: "u1", Name: "golang", Ctime: 1000, Mtime: 1000,
	})
	require.NoError(t, err)
}

func TestTagRepo_Create_Conflict(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(errConflictStub)

	err = r.Create(context.Background(), &model.Tag{ID: "t1", UserID: "u1", Name: "go"})
	assert.ErrorIs(t, err, appErr.ErrConflict)
}

func TestTagRepo_CreateBatch(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 2))

	err = r.CreateBatch(context.Background(), []model.Tag{
		{ID: "t1", UserID: "u1", Name: "a"},
		{ID: "t2", UserID: "u1", Name: "b"},
	})
	require.NoError(t, err)
}

func TestTagRepo_CreateBatch_Empty(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	err = r.CreateBatch(context.Background(), nil)
	require.NoError(t, err)
}

func TestTagRepo_List(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	rows := addTagRow(sqlmock.NewRows(tagCols), "t1", "golang")
	addTagRow(rows, "t2", "rust")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	tags, err := r.List(context.Background(), "u1")
	require.NoError(t, err)
	assert.Len(t, tags, 2)
}

func TestTagRepo_ListPage_NoQuery(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	rows := addTagRow(sqlmock.NewRows(tagCols), "t1", "golang")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	tags, err := r.ListPage(context.Background(), "u1", "", 10, 0)
	require.NoError(t, err)
	assert.Len(t, tags, 1)
}

func TestTagRepo_ListPage_WithQuery(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	exactRows := sqlmock.NewRows(tagCols)
	mock.ExpectQuery("SELECT").WillReturnRows(exactRows)
	fuzzyRows := addTagRow(sqlmock.NewRows(tagCols), "t1", "golang")
	mock.ExpectQuery("SELECT").WillReturnRows(fuzzyRows)

	tags, err := r.ListPage(context.Background(), "u1", "go", 10, 0)
	require.NoError(t, err)
	assert.Len(t, tags, 1)
}

func TestTagRepo_ListByIDs(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	rows := addTagRow(sqlmock.NewRows(tagCols), "t1", "golang")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	tags, err := r.ListByIDs(context.Background(), "u1", []string{"t1"})
	require.NoError(t, err)
	assert.Len(t, tags, 1)
}

func TestTagRepo_ListByIDs_Empty(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	tags, err := r.ListByIDs(context.Background(), "u1", nil)
	require.NoError(t, err)
	assert.Empty(t, tags)
}

func TestTagRepo_ListByNames(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	rows := addTagRow(sqlmock.NewRows(tagCols), "t1", "golang")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	tags, err := r.ListByNames(context.Background(), "u1", []string{"golang"})
	require.NoError(t, err)
	assert.Len(t, tags, 1)
}

func TestTagRepo_ListByNames_Empty(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	tags, err := r.ListByNames(context.Background(), "u1", nil)
	require.NoError(t, err)
	assert.Empty(t, tags)
}

func TestTagRepo_ListSummary(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	rows := sqlmock.NewRows([]string{"id", "name", "pinned", "cnt", "mtime"}).
		AddRow("t1", "golang", 0, 5, int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	items, err := r.ListSummary(context.Background(), "u1", "", 20, 0)
	require.NoError(t, err)
	require.Len(t, items, 1)
	assert.Equal(t, 5, items[0].Count)
}

func TestTagRepo_UpdatePinned(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 1))

	err = r.UpdatePinned(context.Background(), "u1", "t1", 1, 3000)
	require.NoError(t, err)
}

func TestTagRepo_UpdatePinned_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 0))

	err = r.UpdatePinned(context.Background(), "u1", "t1", 1, 3000)
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestTagRepo_Delete(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnResult(sqlmock.NewResult(0, 1))

	err = r.Delete(context.Background(), "u1", "t1")
	require.NoError(t, err)
}

func TestTagRepo_Delete_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnResult(sqlmock.NewResult(0, 0))

	err = r.Delete(context.Background(), "u1", "t1")
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestClampUint(t *testing.T) {
	assert.Equal(t, uint(0), clampUint(-5))
	assert.Equal(t, uint(0), clampUint(0))
	assert.Equal(t, uint(10), clampUint(10))
}

func TestTagRepo_Create_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(errDB)
	err = r.Create(context.Background(), &model.Tag{ID: "t1", UserID: "u1", Name: "go"})
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrConflict)
}

func TestTagRepo_CreateBatch_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(errDB)
	err = r.CreateBatch(context.Background(), []model.Tag{{ID: "t1", UserID: "u1"}})
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrConflict)
}

func TestTagRepo_CreateBatch_Conflict(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(errConflictStub)
	err = r.CreateBatch(context.Background(), []model.Tag{{ID: "t1", UserID: "u1"}})
	assert.ErrorIs(t, err, appErr.ErrConflict)
}

func TestTagRepo_List_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.List(context.Background(), "u1")
	assert.Error(t, err)
}

func TestTagRepo_List_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("t1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.List(context.Background(), "u1")
	assert.Error(t, err)
}

func TestTagRepo_ListPage_NegativeOffset(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	rows := addTagRow(sqlmock.NewRows(tagCols), "t1", "go")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	tags, err := r.ListPage(context.Background(), "u1", "", 10, -1)
	require.NoError(t, err)
	assert.Len(t, tags, 1)
}

func TestTagRepo_ListPage_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListPage(context.Background(), "u1", "", 10, 0)
	assert.Error(t, err)
}

func TestTagRepo_ListPage_WithQuery_ExactError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListPage(context.Background(), "u1", "go", 10, 0)
	assert.Error(t, err)
}

func TestTagRepo_ListPage_WithQuery_FuzzyError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	mock.ExpectQuery("SELECT").WillReturnRows(sqlmock.NewRows(tagCols))
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListPage(context.Background(), "u1", "go", 10, 0)
	assert.Error(t, err)
}

func TestTagRepo_ListPage_WithQuery_ExactMatchFillsLimit(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	exactRows := addTagRow(sqlmock.NewRows(tagCols), "t1", "go")
	mock.ExpectQuery("SELECT").WillReturnRows(exactRows)
	tags, err := r.ListPage(context.Background(), "u1", "go", 1, 0)
	require.NoError(t, err)
	assert.Len(t, tags, 1)
}

func TestTagRepo_ListPage_WithQuery_NonZeroOffset(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	fuzzyRows := addTagRow(sqlmock.NewRows(tagCols), "t2", "golang")
	mock.ExpectQuery("SELECT").WillReturnRows(fuzzyRows)
	tags, err := r.ListPage(context.Background(), "u1", "go", 10, 5)
	require.NoError(t, err)
	assert.Len(t, tags, 1)
}

func TestTagRepo_ListByIDs_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListByIDs(context.Background(), "u1", []string{"t1"})
	assert.Error(t, err)
}

func TestTagRepo_ListByIDs_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("t1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByIDs(context.Background(), "u1", []string{"t1"})
	assert.Error(t, err)
}

func TestTagRepo_ListByNames_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListByNames(context.Background(), "u1", []string{"golang"})
	assert.Error(t, err)
}

func TestTagRepo_ListSummary_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListSummary(context.Background(), "u1", "", 20, 0)
	assert.Error(t, err)
}

func TestTagRepo_ListSummary_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("t1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListSummary(context.Background(), "u1", "", 20, 0)
	assert.Error(t, err)
}

func TestTagRepo_ListSummary_WithQuery(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	rows := sqlmock.NewRows([]string{"id", "name", "pinned", "cnt", "mtime"}).
		AddRow("t1", "golang", 0, 3, int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	items, err := r.ListSummary(context.Background(), "u1", "go", 20, 0)
	require.NoError(t, err)
	assert.Len(t, items, 1)
}

func TestTagRepo_ListSummary_NegativeDefaults(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	mock.ExpectQuery("SELECT").WillReturnRows(sqlmock.NewRows([]string{"id", "name", "pinned", "cnt", "mtime"}))
	_, err = r.ListSummary(context.Background(), "u1", "", -1, -5)
	require.NoError(t, err)
}

func TestTagRepo_UpdatePinned_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	mock.ExpectExec("UPDATE").WillReturnError(errDB)
	err = r.UpdatePinned(context.Background(), "u1", "t1", 1, 3000)
	assert.Error(t, err)
}

func TestTagRepo_Delete_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnError(errDB)
	err = r.Delete(context.Background(), "u1", "t1")
	assert.Error(t, err)
}

func TestTagRepo_List_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "name", "pinned", "ctime", "mtime"}).
		AddRow("t1", "u1", "Tag1", 0, int64(1000), int64(2000)).
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.List(context.Background(), "u1")
	assert.Error(t, err)
}

func TestTagRepo_ListByIDs_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "name", "pinned", "ctime", "mtime"}).
		AddRow("t1", "u1", "Tag1", 0, int64(1000), int64(2000)).
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByIDs(context.Background(), "u1", []string{"t1"})
	assert.Error(t, err)
}

func TestTagRepo_ListByNames_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "name", "pinned", "ctime", "mtime"}).
		AddRow("t1", "u1", "Tag1", 0, int64(1000), int64(2000)).
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByNames(context.Background(), "u1", []string{"Tag1"})
	assert.Error(t, err)
}

func TestTagRepo_ListSummary_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	rows := sqlmock.NewRows([]string{"id", "name", "pinned", "cnt", "mtime"}).
		AddRow("t1", "Tag1", 0, 5, int64(2000)).
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListSummary(context.Background(), "u1", "Tag", 10, 0)
	assert.Error(t, err)
}

func TestTagRepo_UpdatePinned_RowsAffectedError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewErrorResult(errDB))
	err = r.UpdatePinned(context.Background(), "u1", "t1", 1, 3000)
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}

func TestTagRepo_ListPage_QueryScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewTagRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("t1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListPage(context.Background(), "u1", "", 10, 0)
	assert.Error(t, err)
}
