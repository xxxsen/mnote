package repo

import (
	"context"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConn_FallbackToDB(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	ctx := context.Background()
	got := conn(ctx, db)
	assert.Equal(t, db, got)
}

func TestConn_UsesContextTx(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	mock.ExpectBegin()
	tx, err := db.Begin()
	require.NoError(t, err)

	ctx := WithTx(context.Background(), tx)
	got := conn(ctx, db)
	assert.Equal(t, tx, got)
}

func TestTxFromContext_Empty(t *testing.T) {
	assert.Nil(t, TxFromContext(context.Background()))
}

func TestRunInTx_Success(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	mock.ExpectBegin()
	mock.ExpectCommit()

	called := false
	err = RunInTx(context.Background(), db, func(_ context.Context) error {
		called = true
		return nil
	})
	require.NoError(t, err)
	assert.True(t, called)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestRunInTx_ErrorRollback(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	mock.ExpectBegin()
	mock.ExpectRollback()

	testErr := errors.New("test error")
	err = RunInTx(context.Background(), db, func(_ context.Context) error {
		return testErr
	})
	assert.ErrorIs(t, err, testErr)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestRunInTx_BeginError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	mock.ExpectBegin().WillReturnError(errors.New("begin fail"))

	err = RunInTx(context.Background(), db, func(_ context.Context) error {
		return nil
	})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "begin transaction")
}

func TestBeginOrJoin_NewTx(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	mock.ExpectBegin()

	tx, owned, err := beginOrJoin(context.Background(), db)
	require.NoError(t, err)
	assert.True(t, owned)
	assert.NotNil(t, tx)
}

func TestBeginOrJoin_JoinExisting(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	mock.ExpectBegin()
	existingTx, err := db.Begin()
	require.NoError(t, err)

	ctx := WithTx(context.Background(), existingTx)
	tx, owned, err := beginOrJoin(ctx, db)
	require.NoError(t, err)
	assert.False(t, owned)
	assert.Equal(t, existingTx, tx)
}
