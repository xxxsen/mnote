package repo

import (
	"context"
	"database/sql"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

func TestImportJobRepo_Create(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 1))
	err = r.Create(context.Background(), &model.ImportJob{
		ID: "j1", UserID: "u1", Status: "pending",
	})
	require.NoError(t, err)
}

func TestImportJobRepo_Get(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	rows := sqlmock.NewRows([]string{
		"id", "user_id", "source", "status", "require_content",
		"processed", "total", "tags_json", "report_json", "ctime", "mtime",
	}).AddRow("j1", "u1", "hedgedoc", "done", 0, 10, 10, "[]", "{}", int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	job, err := r.Get(context.Background(), "u1", "j1")
	require.NoError(t, err)
	assert.Equal(t, "j1", job.ID)
	assert.Equal(t, 10, job.Total)
}

func TestImportJobRepo_Get_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(sql.ErrNoRows)
	_, err = r.Get(context.Background(), "u1", "missing")
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestImportJobRepo_DeleteBefore(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	mock.ExpectExec("DELETE").WillReturnResult(sqlmock.NewResult(0, 3))
	n, err := r.DeleteBefore(context.Background(), 5000)
	require.NoError(t, err)
	assert.Equal(t, int64(3), n)
}

func TestImportJobRepo_Delete(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	mock.ExpectExec("DELETE").WillReturnResult(sqlmock.NewResult(0, 1))
	err = r.Delete(context.Background(), "u1", "j1")
	require.NoError(t, err)
}

func TestBoolToInt(t *testing.T) {
	assert.Equal(t, 1, boolToInt(true))
	assert.Equal(t, 0, boolToInt(false))
}

func TestImportJobNoteRepo_DeleteBefore(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobNoteRepo(db)
	mock.ExpectExec("DELETE").WillReturnResult(sqlmock.NewResult(0, 5))
	n, err := r.DeleteBefore(context.Background(), 5000)
	require.NoError(t, err)
	assert.Equal(t, int64(5), n)
}

func TestImportJobRepo_UpdateStatusIf(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 1))

	changed, err := r.UpdateStatusIf(context.Background(), "u1", "j1", "pending", "processing", 2000)
	require.NoError(t, err)
	assert.True(t, changed)
}

func TestImportJobRepo_UpdateStatusIf_NotChanged(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 0))

	changed, err := r.UpdateStatusIf(context.Background(), "u1", "j1", "pending", "processing", 2000)
	require.NoError(t, err)
	assert.False(t, changed)
}

func TestImportJobRepo_UpdateSummary(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 1))

	err = r.UpdateSummary(context.Background(), &model.ImportJob{
		ID: "j1", UserID: "u1", Status: "done",
		Total: 10, Processed: 10, Tags: []string{"go"},
		Report: &model.ImportReport{}, Mtime: 3000,
	})
	require.NoError(t, err)
}

func TestImportJobRepo_UpdateSummary_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 0))

	err = r.UpdateSummary(context.Background(), &model.ImportJob{
		ID: "j1", UserID: "u1", Status: "done", Mtime: 3000,
	})
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestImportJobRepo_UpdateProgress(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 1))

	err = r.UpdateProgress(context.Background(), "u1", "j1", 5, 10, nil, "processing", 2000)
	require.NoError(t, err)
}

func TestImportJobRepo_UpdateProgress_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 0))

	err = r.UpdateProgress(context.Background(), "u1", "j1", 5, 10, nil, "processing", 2000)
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestImportJobNoteRepo_InsertBatch(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobNoteRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 2))

	err = r.InsertBatch(context.Background(), []model.ImportJobNote{
		{ID: "n1", JobID: "j1", UserID: "u1", Title: "Note1", Tags: []string{"go"}},
		{ID: "n2", JobID: "j1", UserID: "u1", Title: "Note2"},
	})
	require.NoError(t, err)
}

func TestImportJobNoteRepo_InsertBatch_Empty(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobNoteRepo(db)
	err = r.InsertBatch(context.Background(), nil)
	require.NoError(t, err)
}

var noteCols = []string{
	"id", "job_id", "user_id", "position", "title", "content", "summary", "tags_json", "source", "ctime",
}

func TestImportJobNoteRepo_ListByJob(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobNoteRepo(db)
	rows := sqlmock.NewRows(noteCols).
		AddRow("n1", "j1", "u1", 0, "Title1", "Content1", "Sum1", `["go"]`, "hedgedoc", int64(1000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	notes, err := r.ListByJob(context.Background(), "u1", "j1")
	require.NoError(t, err)
	require.Len(t, notes, 1)
	assert.Equal(t, "Title1", notes[0].Title)
	assert.Equal(t, []string{"go"}, notes[0].Tags)
}

func TestImportJobNoteRepo_ListByJobLimit(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobNoteRepo(db)
	rows := sqlmock.NewRows(noteCols).
		AddRow("n1", "j1", "u1", 0, "Title1", "C1", "S1", `[]`, "zip", int64(1000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	notes, err := r.ListByJobLimit(context.Background(), "u1", "j1", 5)
	require.NoError(t, err)
	assert.Len(t, notes, 1)
}

func TestImportJobNoteRepo_ListTitles(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobNoteRepo(db)
	rows := sqlmock.NewRows([]string{"title"}).
		AddRow("Note 1").
		AddRow("Note 2")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	titles, err := r.ListTitles(context.Background(), "u1", "j1")
	require.NoError(t, err)
	assert.Len(t, titles, 2)
}

func TestImportJobRepo_Create_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(errDB)
	err = r.Create(context.Background(), &model.ImportJob{ID: "j1", UserID: "u1"})
	assert.Error(t, err)
}

func TestImportJobRepo_Create_WithReport(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 1))
	err = r.Create(context.Background(), &model.ImportJob{
		ID: "j1", UserID: "u1", Status: "pending",
		Report: &model.ImportReport{},
	})
	require.NoError(t, err)
}

func TestImportJobRepo_Get_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.Get(context.Background(), "u1", "j1")
	assert.Error(t, err)
}

func TestImportJobRepo_UpdateStatusIf_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	mock.ExpectExec("UPDATE").WillReturnError(errDB)
	_, err = r.UpdateStatusIf(context.Background(), "u1", "j1", "pending", "done", 2000)
	assert.Error(t, err)
}

func TestImportJobRepo_UpdateSummary_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	mock.ExpectExec("UPDATE").WillReturnError(errDB)
	err = r.UpdateSummary(context.Background(), &model.ImportJob{ID: "j1", UserID: "u1"})
	assert.Error(t, err)
}

func TestImportJobRepo_UpdateProgress_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	mock.ExpectExec("UPDATE").WillReturnError(errDB)
	err = r.UpdateProgress(context.Background(), "u1", "j1", 5, 10, nil, "processing", 2000)
	assert.Error(t, err)
}

func TestImportJobRepo_UpdateProgress_WithReport(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 1))
	err = r.UpdateProgress(context.Background(), "u1", "j1", 5, 10, &model.ImportReport{}, "processing", 2000)
	require.NoError(t, err)
}

func TestImportJobRepo_DeleteBefore_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	mock.ExpectExec("DELETE").WillReturnError(errDB)
	_, err = r.DeleteBefore(context.Background(), 5000)
	assert.Error(t, err)
}

func TestImportJobRepo_Delete_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	mock.ExpectExec("DELETE").WillReturnError(errDB)
	err = r.Delete(context.Background(), "u1", "j1")
	assert.Error(t, err)
}

func TestImportJobNoteRepo_InsertBatch_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobNoteRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(errDB)
	err = r.InsertBatch(context.Background(), []model.ImportJobNote{
		{ID: "n1", JobID: "j1", UserID: "u1", Title: "Note1"},
	})
	assert.Error(t, err)
}

func TestImportJobNoteRepo_ListByJob_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobNoteRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListByJob(context.Background(), "u1", "j1")
	assert.Error(t, err)
}

func TestImportJobNoteRepo_ListByJob_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobNoteRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("n1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByJob(context.Background(), "u1", "j1")
	assert.Error(t, err)
}

func TestImportJobNoteRepo_ListByJobLimit_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobNoteRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListByJobLimit(context.Background(), "u1", "j1", 5)
	assert.Error(t, err)
}

func TestImportJobNoteRepo_ListByJobLimit_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobNoteRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("n1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByJobLimit(context.Background(), "u1", "j1", 5)
	assert.Error(t, err)
}

func TestImportJobNoteRepo_ListTitles_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobNoteRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListTitles(context.Background(), "u1", "j1")
	assert.Error(t, err)
}

func TestImportJobNoteRepo_ListTitles_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobNoteRepo(db)
	rows := sqlmock.NewRows([]string{"title", "extra"}).AddRow("t1", "x")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListTitles(context.Background(), "u1", "j1")
	assert.Error(t, err)
}

func TestImportJobNoteRepo_DeleteBefore_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobNoteRepo(db)
	mock.ExpectExec("DELETE").WillReturnError(errDB)
	_, err = r.DeleteBefore(context.Background(), 5000)
	assert.Error(t, err)
}

func TestImportJobRepo_UpdateStatusIf_RowsAffectedError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewErrorResult(errDB))
	_, err = r.UpdateStatusIf(context.Background(), "u1", "j1", "pending", "done", 1000)
	assert.Error(t, err)
}

func TestImportJobRepo_UpdateSummary_RowsAffectedError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewErrorResult(errDB))
	err = r.UpdateSummary(context.Background(), &model.ImportJob{ID: "j1", UserID: "u1"})
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}

func TestImportJobRepo_DeleteBefore_RowsAffectedError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	mock.ExpectExec("DELETE").WillReturnResult(sqlmock.NewErrorResult(errDB))
	_, err = r.DeleteBefore(context.Background(), 5000)
	assert.Error(t, err)
}

func TestImportJobNoteRepo_ListByJob_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobNoteRepo(db)
	noteCols := []string{"id", "job_id", "user_id", "position", "title", "content", "summary", "tags_json", "source", "ctime"}
	rows := sqlmock.NewRows(noteCols).
		AddRow("n1", "j1", "u1", 0, "title", "content", "sum", "[]", "file.md", int64(1000)).
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByJob(context.Background(), "u1", "j1")
	assert.Error(t, err)
}

func TestImportJobNoteRepo_ListByJobLimit_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobNoteRepo(db)
	noteCols := []string{"id", "job_id", "user_id", "position", "title", "content", "summary", "tags_json", "source", "ctime"}
	rows := sqlmock.NewRows(noteCols).
		AddRow("n1", "j1", "u1", 0, "title", "content", "sum", "[]", "file.md", int64(1000)).
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByJobLimit(context.Background(), "u1", "j1", 5)
	assert.Error(t, err)
}

func TestImportJobNoteRepo_ListTitles_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobNoteRepo(db)
	rows := sqlmock.NewRows([]string{"title"}).
		AddRow("t1").
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListTitles(context.Background(), "u1", "j1")
	assert.Error(t, err)
}

func TestImportJobNoteRepo_DeleteBefore_RowsAffectedError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobNoteRepo(db)
	mock.ExpectExec("DELETE").WillReturnResult(sqlmock.NewErrorResult(errDB))
	_, err = r.DeleteBefore(context.Background(), 5000)
	assert.Error(t, err)
}

func TestImportJobRepo_UpdateSummary_WithReport(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 1))
	err = r.UpdateSummary(context.Background(), &model.ImportJob{
		ID: "j1", UserID: "u1",
		Report: &model.ImportReport{Created: 5},
	})
	require.NoError(t, err)
}

func TestImportJobRepo_Get_WithRequireContentAndTags(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewImportJobRepo(db)
	rows := sqlmock.NewRows([]string{
		"id", "user_id", "source", "status", "require_content",
		"processed", "total", "tags_json", "report_json", "ctime", "mtime",
	}).AddRow("j1", "u1", "zip", "done", 1, 5, 5, `["go","rust"]`, `{"imported":5}`, int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	job, err := r.Get(context.Background(), "u1", "j1")
	require.NoError(t, err)
	assert.True(t, job.RequireContent)
	assert.Equal(t, []string{"go", "rust"}, job.Tags)
	assert.NotNil(t, job.Report)
}
