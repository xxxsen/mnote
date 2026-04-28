package repo

import (
	"context"
	"database/sql"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
)

func TestEmbeddingCacheRepo_Save(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingCacheRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 1))

	err = r.Save(context.Background(), &model.EmbeddingCache{
		ModelName:   "model1",
		TaskType:    "embed",
		ContentHash: "hash1",
		Embedding:   []float32{0.1, 0.2, 0.3},
		Ctime:       1000,
	})
	require.NoError(t, err)
}

func TestEmbeddingCacheRepo_Save_Error(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingCacheRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(assert.AnError)

	err = r.Save(context.Background(), &model.EmbeddingCache{
		ModelName: "m", TaskType: "t", ContentHash: "h",
		Embedding: []float32{0.1},
	})
	assert.Error(t, err)
}

func TestEmbeddingCacheRepo_Get_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingCacheRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(sql.ErrNoRows)

	emb, found, err := r.Get(context.Background(), "model1", "embed", "hash1")
	require.NoError(t, err)
	assert.False(t, found)
	assert.Nil(t, emb)
}

func TestEmbeddingCacheRepo_Get_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingCacheRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(assert.AnError)

	_, _, err = r.Get(context.Background(), "model1", "embed", "hash1")
	assert.Error(t, err)
}

func TestEmbeddingCacheRepo_DeleteBefore(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingCacheRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnResult(sqlmock.NewResult(0, 5))

	n, err := r.DeleteBefore(context.Background(), 5000)
	require.NoError(t, err)
	assert.Equal(t, int64(5), n)
}

func TestEmbeddingCacheRepo_DeleteBefore_Error(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingCacheRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnError(assert.AnError)

	_, err = r.DeleteBefore(context.Background(), 5000)
	assert.Error(t, err)
}

func TestEmbeddingCacheRepo_DeleteBefore_RowsAffectedError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingCacheRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnResult(sqlmock.NewErrorResult(assert.AnError))

	_, err = r.DeleteBefore(context.Background(), 5000)
	assert.Error(t, err)
}
