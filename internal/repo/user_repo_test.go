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

func TestUserRepo_Create(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewUserRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 1))

	err = r.Create(context.Background(), &model.User{
		ID: "u1", Email: "test@example.com", PasswordHash: "hash",
		Ctime: 1000, Mtime: 1000,
	})
	require.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestUserRepo_Create_Conflict(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewUserRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(
		errConflictStub,
	)

	err = r.Create(context.Background(), &model.User{
		ID: "u1", Email: "test@example.com",
	})
	assert.ErrorIs(t, err, appErr.ErrConflict)
}

func TestUserRepo_GetByEmail(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewUserRepo(db)
	rows := sqlmock.NewRows([]string{"id", "email", "password_hash", "ctime", "mtime"}).
		AddRow("u1", "test@example.com", "hash", int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	user, err := r.GetByEmail(context.Background(), "test@example.com")
	require.NoError(t, err)
	assert.Equal(t, "u1", user.ID)
	assert.Equal(t, "test@example.com", user.Email)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestUserRepo_GetByEmail_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewUserRepo(db)
	rows := sqlmock.NewRows([]string{"id", "email", "password_hash", "ctime", "mtime"})
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	_, err = r.GetByEmail(context.Background(), "missing@example.com")
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestUserRepo_GetByID(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewUserRepo(db)
	rows := sqlmock.NewRows([]string{"id", "email", "password_hash", "ctime", "mtime"}).
		AddRow("u1", "test@example.com", "hash", int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	user, err := r.GetByID(context.Background(), "u1")
	require.NoError(t, err)
	assert.Equal(t, "u1", user.ID)
}

func TestUserRepo_UpdatePassword(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewUserRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 1))

	err = r.UpdatePassword(context.Background(), "u1", "newhash", 3000)
	require.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestUserRepo_UpdatePassword_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewUserRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 0))

	err = r.UpdatePassword(context.Background(), "u1", "newhash", 3000)
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestUserRepo_Create_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewUserRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(errDB)
	err = r.Create(context.Background(), &model.User{ID: "u1", Email: "a@b.com"})
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrConflict)
}

func TestUserRepo_GetByEmail_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewUserRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.GetByEmail(context.Background(), "test@example.com")
	assert.Error(t, err)
}

func TestUserRepo_GetByEmail_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewUserRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("u1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetByEmail(context.Background(), "test@example.com")
	assert.Error(t, err)
}

func TestUserRepo_UpdatePassword_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewUserRepo(db)
	mock.ExpectExec("UPDATE").WillReturnError(errDB)
	err = r.UpdatePassword(context.Background(), "u1", "newhash", 3000)
	assert.Error(t, err)
}

func TestUserRepo_UpdatePassword_RowsAffectedError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewUserRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewErrorResult(errDB))
	err = r.UpdatePassword(context.Background(), "u1", "newhash", 3000)
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}

func TestUserRepo_GetByEmail_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewUserRepo(db)
	rows := sqlmock.NewRows([]string{"id", "email", "password_hash", "ctime", "mtime"}).
		CloseError(errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.GetByEmail(context.Background(), "test@example.com")
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}
