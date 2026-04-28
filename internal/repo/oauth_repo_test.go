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

var oauthCols = []string{"id", "user_id", "provider", "provider_user_id", "email", "ctime", "mtime"}

func TestOAuthRepo_Create(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewOAuthRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 1))

	err = r.Create(context.Background(), &model.OAuthAccount{
		ID: "oa1", UserID: "u1", Provider: "github",
		ProviderUserID: "gh123", Email: "test@gh.com",
		Ctime: 1000, Mtime: 1000,
	})
	require.NoError(t, err)
}

func TestOAuthRepo_Create_Conflict(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewOAuthRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(errConflictStub)

	err = r.Create(context.Background(), &model.OAuthAccount{ID: "oa1"})
	assert.ErrorIs(t, err, appErr.ErrConflict)
}

func TestOAuthRepo_GetByProviderUserID(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewOAuthRepo(db)
	rows := sqlmock.NewRows(oauthCols).
		AddRow("oa1", "u1", "github", "gh123", "test@gh.com", int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	account, err := r.GetByProviderUserID(context.Background(), "github", "gh123")
	require.NoError(t, err)
	assert.Equal(t, "oa1", account.ID)
	assert.Equal(t, "github", account.Provider)
}

func TestOAuthRepo_GetByProviderUserID_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewOAuthRepo(db)
	rows := sqlmock.NewRows(oauthCols)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	_, err = r.GetByProviderUserID(context.Background(), "github", "missing")
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestOAuthRepo_GetByUserProvider(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewOAuthRepo(db)
	rows := sqlmock.NewRows(oauthCols).
		AddRow("oa1", "u1", "google", "g456", "test@g.com", int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	account, err := r.GetByUserProvider(context.Background(), "u1", "google")
	require.NoError(t, err)
	assert.Equal(t, "google", account.Provider)
}

func TestOAuthRepo_ListByUser(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewOAuthRepo(db)
	rows := sqlmock.NewRows(oauthCols).
		AddRow("oa1", "u1", "github", "gh1", "a@b.com", int64(1000), int64(2000)).
		AddRow("oa2", "u1", "google", "g1", "a@g.com", int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	accounts, err := r.ListByUser(context.Background(), "u1")
	require.NoError(t, err)
	assert.Len(t, accounts, 2)
}

func TestOAuthRepo_CountByUser(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewOAuthRepo(db)
	rows := sqlmock.NewRows([]string{"count"}).AddRow(2)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	count, err := r.CountByUser(context.Background(), "u1")
	require.NoError(t, err)
	assert.Equal(t, 2, count)
}

func TestOAuthRepo_DeleteByUserProvider(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewOAuthRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnResult(sqlmock.NewResult(0, 1))

	err = r.DeleteByUserProvider(context.Background(), "u1", "github")
	require.NoError(t, err)
}

func TestOAuthRepo_DeleteByUserProvider_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewOAuthRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnResult(sqlmock.NewResult(0, 0))

	err = r.DeleteByUserProvider(context.Background(), "u1", "github")
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestOAuthRepo_GetOAuthAccount_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewOAuthRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.GetByProviderUserID(context.Background(), "github", "gh123")
	assert.Error(t, err)
}

func TestOAuthRepo_GetOAuthAccount_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewOAuthRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("oa1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetByProviderUserID(context.Background(), "github", "gh123")
	assert.Error(t, err)
}

func TestOAuthRepo_ListByUser_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewOAuthRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.ListByUser(context.Background(), "u1")
	assert.Error(t, err)
}

func TestOAuthRepo_ListByUser_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewOAuthRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("oa1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByUser(context.Background(), "u1")
	assert.Error(t, err)
}

func TestOAuthRepo_CountByUser_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewOAuthRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.CountByUser(context.Background(), "u1")
	assert.Error(t, err)
}

func TestOAuthRepo_CountByUser_NoRows(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewOAuthRepo(db)
	rows := sqlmock.NewRows([]string{"count"})
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	count, err := r.CountByUser(context.Background(), "u1")
	require.NoError(t, err)
	assert.Equal(t, 0, count)
}

func TestOAuthRepo_CountByUser_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewOAuthRepo(db)
	rows := sqlmock.NewRows([]string{"count"}).AddRow("not_int")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.CountByUser(context.Background(), "u1")
	assert.Error(t, err)
}

func TestOAuthRepo_DeleteByUserProvider_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewOAuthRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnError(errDB)
	err = r.DeleteByUserProvider(context.Background(), "u1", "github")
	assert.Error(t, err)
}

func TestOAuthRepo_DeleteByUserProvider_RowsAffectedError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewOAuthRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnResult(sqlmock.NewErrorResult(errDB))
	err = r.DeleteByUserProvider(context.Background(), "u1", "github")
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}

func TestOAuthRepo_ListByUser_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewOAuthRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "provider", "provider_user_id", "email", "ctime", "mtime"}).
		AddRow("o1", "u1", "github", "gh1", "test@example.com", int64(1000), int64(2000)).
		RowError(0, errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.ListByUser(context.Background(), "u1")
	assert.Error(t, err)
}

func TestOAuthRepo_GetOAuthAccount_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewOAuthRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "provider", "provider_user_id", "email", "ctime", "mtime"}).
		CloseError(errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetByProviderUserID(context.Background(), "github", "gh1")
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}

func TestOAuthRepo_CountByUser_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewOAuthRepo(db)
	rows := sqlmock.NewRows([]string{"count"}).CloseError(errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.CountByUser(context.Background(), "u1")
	assert.Error(t, err)
}
