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

func TestEmailVerificationRepo_Create(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmailVerificationRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 1))
	err = r.Create(context.Background(), &model.EmailVerificationCode{
		ID: "e1", Email: "test@example.com", Purpose: "register",
		CodeHash: "hash", Ctime: 1000, ExpiresAt: 2000,
	})
	require.NoError(t, err)
}

func TestEmailVerificationRepo_LatestByEmail(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmailVerificationRepo(db)
	rows := sqlmock.NewRows([]string{
		"id", "email", "purpose", "code_hash", "used", "ctime", "expires_at",
	}).AddRow("e1", "test@example.com", "register", "hash", 0, int64(1000), int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	code, err := r.LatestByEmail(context.Background(), "test@example.com", "register")
	require.NoError(t, err)
	assert.Equal(t, "e1", code.ID)
	assert.Equal(t, "test@example.com", code.Email)
}

func TestEmailVerificationRepo_LatestByEmail_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmailVerificationRepo(db)
	rows := sqlmock.NewRows([]string{
		"id", "email", "purpose", "code_hash", "used", "ctime", "expires_at",
	})
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	_, err = r.LatestByEmail(context.Background(), "missing@example.com", "register")
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestEmailVerificationRepo_MarkUsed(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmailVerificationRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 1))
	err = r.MarkUsed(context.Background(), "e1")
	require.NoError(t, err)
}

func TestEmailVerificationRepo_MarkUsed_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmailVerificationRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewResult(0, 0))
	err = r.MarkUsed(context.Background(), "missing")
	assert.ErrorIs(t, err, appErr.ErrNotFound)
}

func TestEmailVerificationRepo_LatestByEmail_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmailVerificationRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(errDB)
	_, err = r.LatestByEmail(context.Background(), "test@example.com", "register")
	assert.Error(t, err)
}

func TestEmailVerificationRepo_LatestByEmail_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmailVerificationRepo(db)
	rows := sqlmock.NewRows([]string{"id"}).AddRow("e1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.LatestByEmail(context.Background(), "test@example.com", "register")
	assert.Error(t, err)
}

func TestEmailVerificationRepo_MarkUsed_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmailVerificationRepo(db)
	mock.ExpectExec("UPDATE").WillReturnError(errDB)
	err = r.MarkUsed(context.Background(), "e1")
	assert.Error(t, err)
}

func TestEmailVerificationRepo_MarkUsed_RowsAffectedError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmailVerificationRepo(db)
	mock.ExpectExec("UPDATE").WillReturnResult(sqlmock.NewErrorResult(errDB))
	err = r.MarkUsed(context.Background(), "e1")
	assert.Error(t, err)
	assert.NotErrorIs(t, err, appErr.ErrNotFound)
}

func TestEmailVerificationRepo_LatestByEmail_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmailVerificationRepo(db)
	rows := sqlmock.NewRows([]string{
		"id", "email", "purpose", "code_hash", "used", "ctime", "expires_at",
	}).CloseError(errDB)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)
	_, err = r.LatestByEmail(context.Background(), "test@example.com", "register")
	assert.Error(t, err)
}
