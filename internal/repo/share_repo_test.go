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

var shareCols = []string{
	"id", "user_id", "document_id", "token",
	"state", "expires_at", "password_hash", "permission", "allow_download", "ctime", "mtime",
}

func addShareRow(rows *sqlmock.Rows, id, token string) *sqlmock.Rows {
	return rows.AddRow(id, "u1", "d1", token, 1, int64(0), "", 1, 0, int64(1000), int64(2000))
}

func TestShareRepo_Create(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 1))

	err = r.Create(context.Background(), &model.Share{
		ID: "s1", UserID: "u1", DocumentID: "d1", Token: "tok1",
		State: 1, Permission: 1, Ctime: 1000, Mtime: 1000,
	})
	require.NoError(t, err)
}

func TestShareRepo_Create_Conflict(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(errConflictStub)

	err = r.Create(context.Background(), &model.Share{ID: "s1"})
	assert.ErrorIs(t, err, appErr.ErrConflict)
}

func TestShareRepo_UpdateConfigByDocument(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 1))

	err = r.UpdateConfigByDocument(context.Background(), "u1", "d1", 0, "hash", 1, 1, 3000)
	require.NoError(t, err)
}

func TestShareRepo_UpdateConfigByDocument_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 0))

	err = r.UpdateConfigByDocument(context.Background(), "u1", "d1", 0, "", 1, 0, 3000)
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestShareRepo_RevokeByDocument(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 1))

	err = r.RevokeByDocument(context.Background(), "u1", "d1", 3000)
	require.NoError(t, err)
}

func TestShareRepo_GetByToken(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := addShareRow(sqlmock.NewRows(shareCols), "s1", "tok1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	share, err := r.GetByToken(context.Background(), "tok1")
	require.NoError(t, err)
	assert.Equal(t, "s1", share.ID)
	assert.Equal(t, "tok1", share.Token)
}

func TestShareRepo_GetByToken_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows(shareCols)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	_, err = r.GetByToken(context.Background(), "missing")
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestShareRepo_GetByToken_WithPassword(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows(shareCols).
		AddRow("s1", "u1", "d1", "tok1", 1, int64(0), "hashed_pw", 1, 0, int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	share, err := r.GetByToken(context.Background(), "tok1")
	require.NoError(t, err)
	assert.True(t, share.HasPassword)
	assert.Equal(t, "hashed_pw", share.PasswordHash)
	assert.Empty(t, share.Password)
}

func TestShareRepo_GetActiveByDocument(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := addShareRow(sqlmock.NewRows(shareCols), "s1", "tok1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	share, err := r.GetActiveByDocument(context.Background(), "u1", "d1")
	require.NoError(t, err)
	assert.Equal(t, "s1", share.ID)
}

func TestShareRepo_ListActiveDocuments(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	sdCols := []string{"id", "title", "summary", "mtime", "token", "expires_at", "permission", "allow_download"}
	rows := sqlmock.NewRows(sdCols).
		AddRow("d1", "Doc1", "sum1", int64(1000), "tok1", int64(0), 1, 0)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	docs, err := r.ListActiveDocuments(context.Background(), "u1", "")
	require.NoError(t, err)
	require.Len(t, docs, 1)
	assert.Equal(t, "Doc1", docs[0].Title)
}

func TestShareRepo_CreateComment(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 1))

	err = r.CreateComment(context.Background(), &model.ShareComment{
		ID: "c1", ShareID: "s1", DocumentID: "d1",
		Author: "anon", Content: "hello", State: 1,
		Ctime: 1000, Mtime: 1000,
	})
	require.NoError(t, err)
}

func TestShareRepo_CreateComment_Error(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(assert.AnError)

	err = r.CreateComment(context.Background(), &model.ShareComment{ID: "c1"})
	assert.Error(t, err)
}

var commentCols = []string{
	"id", "share_id", "document_id", "root_id", "reply_to_id",
	"author", "content", "state", "ctime", "mtime",
}

func TestShareRepo_ListCommentsByShare(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows(commentCols).
		AddRow("c1", "s1", "d1", "", "", "anon", "hello", 1, int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	items, err := r.ListCommentsByShare(context.Background(), "s1", 50, 0)
	require.NoError(t, err)
	assert.Len(t, items, 1)
}

func TestShareRepo_GetCommentByID(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows(commentCols).
		AddRow("c1", "s1", "d1", "", "", "anon", "text", 1, int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	c, err := r.GetCommentByID(context.Background(), "c1")
	require.NoError(t, err)
	assert.Equal(t, "c1", c.ID)
}

func TestShareRepo_GetCommentByID_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows(commentCols)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	_, err = r.GetCommentByID(context.Background(), "missing")
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestShareRepo_ListRepliesByRootIDs(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows(commentCols).
		AddRow("c2", "s1", "d1", "c1", "c1", "user2", "reply", 1, int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	items, err := r.ListRepliesByRootIDs(context.Background(), "s1", []string{"c1"})
	require.NoError(t, err)
	assert.Len(t, items, 1)
}

func TestShareRepo_ListRepliesByRootIDs_Empty(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	items, err := r.ListRepliesByRootIDs(context.Background(), "s1", nil)
	require.NoError(t, err)
	assert.Empty(t, items)
}

func TestShareRepo_CountRepliesByRootIDs(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows([]string{"root_id", "count"}).
		AddRow("c1", 3)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	counts, err := r.CountRepliesByRootIDs(context.Background(), "s1", []string{"c1"})
	require.NoError(t, err)
	assert.Equal(t, 3, counts["c1"])
}

func TestShareRepo_CountRepliesByRootIDs_Empty(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	counts, err := r.CountRepliesByRootIDs(context.Background(), "s1", nil)
	require.NoError(t, err)
	assert.Empty(t, counts)
}

func TestShareRepo_CountRootCommentsByShare(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows([]string{"count"}).AddRow(5)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	count, err := r.CountRootCommentsByShare(context.Background(), "s1")
	require.NoError(t, err)
	assert.Equal(t, 5, count)
}

func TestShareRepo_ListRepliesByRootID(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows(commentCols).
		AddRow("c2", "s1", "d1", "c1", "c1", "user2", "reply", 1, int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	items, err := r.ListRepliesByRootID(context.Background(), "s1", "c1", 50, 0)
	require.NoError(t, err)
	assert.Len(t, items, 1)
}

func TestShareRepo_Create_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(errDB)
	err = r.Create(context.Background(), &model.Share{ID: "s1"})
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrConflict)
}

func TestShareRepo_UpdateConfigByDocument_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	mock.ExpectExec("UPDATE").WillReturnError(errDB)
	err = r.UpdateConfigByDocument(context.Background(), "u1", "d1", 0, "", 1, 0, 3000)
	assert.Error(t, err)
}

func TestShareRepo_RevokeByDocument_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	mock.ExpectExec("UPDATE").WillReturnError(errDB)
	err = r.RevokeByDocument(context.Background(), "u1", "d1", 3000)
	assert.Error(t, err)
}

func TestShareRepo_GetByToken_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.GetByToken(context.Background(), "tok1")
	assert.Error(t, err)
}

func TestShareRepo_GetByToken_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("s1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetByToken(context.Background(), "tok1")
	assert.Error(t, err)
}

func TestShareRepo_GetActiveByDocument_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.GetActiveByDocument(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestShareRepo_GetActiveByDocument_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	mock.ExpectQuery("SELECT").WillReturnRows(sqlmock.NewRows(shareCols))
	_, err = r.GetActiveByDocument(context.Background(), "u1", "d1")
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestShareRepo_GetActiveByDocument_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("s1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetActiveByDocument(context.Background(), "u1", "d1")
	assert.Error(t, err)
}

func TestShareRepo_ListActiveDocuments_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListActiveDocuments(context.Background(), "u1", "")
	assert.Error(t, err)
}

func TestShareRepo_ListActiveDocuments_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("d1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListActiveDocuments(context.Background(), "u1", "")
	assert.Error(t, err)
}

func TestShareRepo_ListActiveDocuments_WithQuery(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	sdCols := []string{"id", "title", "summary", "mtime", "token", "expires_at", "permission", "allow_download"}
	rows := sqlmock.NewRows(sdCols).AddRow("d1", "Doc", "sum", int64(1000), "tok", int64(0), 1, 0)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	docs, err := r.ListActiveDocuments(context.Background(), "u1", "Doc")
	require.NoError(t, err)
	assert.Len(t, docs, 1)
}

func TestShareRepo_ListCommentsByShare_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListCommentsByShare(context.Background(), "s1", 50, 0)
	assert.Error(t, err)
}

func TestShareRepo_ListCommentsByShare_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("c1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListCommentsByShare(context.Background(), "s1", 50, 0)
	assert.Error(t, err)
}

func TestShareRepo_ListCommentsByShare_DefaultLimitOffset(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	mock.ExpectQuery("SELECT").WillReturnRows(sqlmock.NewRows(commentCols))
	_, err = r.ListCommentsByShare(context.Background(), "s1", -1, -5)
	require.NoError(t, err)
}

func TestShareRepo_GetCommentByID_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.GetCommentByID(context.Background(), "c1")
	assert.Error(t, err)
}

func TestShareRepo_GetCommentByID_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("c1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetCommentByID(context.Background(), "c1")
	assert.Error(t, err)
}

func TestShareRepo_ListRepliesByRootIDs_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListRepliesByRootIDs(context.Background(), "s1", []string{"c1"})
	assert.Error(t, err)
}

func TestShareRepo_ListRepliesByRootIDs_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("c2")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListRepliesByRootIDs(context.Background(), "s1", []string{"c1"})
	assert.Error(t, err)
}

func TestShareRepo_CountRepliesByRootIDs_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.CountRepliesByRootIDs(context.Background(), "s1", []string{"c1"})
	assert.Error(t, err)
}

func TestShareRepo_CountRepliesByRootIDs_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows([]string{"root_id"}).AddRow("c1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.CountRepliesByRootIDs(context.Background(), "s1", []string{"c1"})
	assert.Error(t, err)
}

func TestShareRepo_CountRootCommentsByShare_Error(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.CountRootCommentsByShare(context.Background(), "s1")
	assert.Error(t, err)
}

func TestShareRepo_ListRepliesByRootID_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListRepliesByRootID(context.Background(), "s1", "c1", 50, 0)
	assert.Error(t, err)
}

func TestShareRepo_ListRepliesByRootID_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("c2")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListRepliesByRootID(context.Background(), "s1", "c1", 50, 0)
	assert.Error(t, err)
}

func TestShareRepo_ListRepliesByRootID_DefaultLimitOffset(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	mock.ExpectQuery("SELECT").WillReturnRows(sqlmock.NewRows(commentCols))
	_, err = r.ListRepliesByRootID(context.Background(), "s1", "c1", -1, -5)
	require.NoError(t, err)
}

func TestShareRepo_UpdateConfigByDocument_RowsAffectedError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewErrorResult(errDB))
	err = r.UpdateConfigByDocument(context.Background(), "u1", "d1", 0, "", 1, 0, 1000)
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}

func TestShareRepo_GetByToken_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows(shareCols).CloseError(errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetByToken(context.Background(), "tok1")
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}

func TestShareRepo_GetActiveByDocument_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows(shareCols).CloseError(errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetActiveByDocument(context.Background(), "u1", "d1")
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}

func TestShareRepo_GetCommentByID_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows(commentCols).CloseError(errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetCommentByID(context.Background(), "c1")
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}

func TestShareRepo_ListActiveDocuments_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows([]string{"id", "title", "summary", "mtime", "token", "expires_at", "permission", "allow_download"}).
		AddRow("d1", "Title", "Sum", int64(1000), "tok", int64(0), 1, 0).
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListActiveDocuments(context.Background(), "u1", "")
	assert.Error(t, err)
}

func TestShareRepo_ListCommentsByShare_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows(commentCols).
		AddRow("c1", "s1", "d1", "", "", "user", "hi", 1, int64(1000), int64(2000)).
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListCommentsByShare(context.Background(), "s1", 50, 0)
	assert.Error(t, err)
}

func TestShareRepo_ListRepliesByRootIDs_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows(commentCols).
		AddRow("c2", "s1", "d1", "c1", "", "user", "reply", 1, int64(1000), int64(2000)).
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListRepliesByRootIDs(context.Background(), "s1", []string{"c1"})
	assert.Error(t, err)
}

func TestShareRepo_CountRepliesByRootIDs_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows([]string{"root_id", "count"}).
		AddRow("c1", 3).
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.CountRepliesByRootIDs(context.Background(), "s1", []string{"c1"})
	assert.Error(t, err)
}

func TestShareRepo_ListRepliesByRootID_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewShareRepo(db)
	rows := sqlmock.NewRows(commentCols).
		AddRow("c2", "s1", "d1", "c1", "", "user", "reply", 1, int64(1000), int64(2000)).
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListRepliesByRootID(context.Background(), "s1", "c1", 50, 0)
	assert.Error(t, err)
}
