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

func TestEmbeddingRepo_Save(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 1))

	err = r.Save(context.Background(), &model.DocumentEmbedding{
		DocumentID: "d1", UserID: "u1", ContentHash: "hash1", Mtime: 1000,
	})
	require.NoError(t, err)
}

func TestEmbeddingRepo_Save_Error(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	mock.ExpectExec("INSERT INTO").WillReturnError(assert.AnError)

	err = r.Save(context.Background(), &model.DocumentEmbedding{DocumentID: "d1"})
	assert.Error(t, err)
}

func TestEmbeddingRepo_SaveChunks_Empty(t *testing.T) {
	db, _, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	err = r.SaveChunks(context.Background(), nil)
	require.NoError(t, err)
}

func TestEmbeddingRepo_SaveChunks_BeginError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	mock.ExpectBegin().WillReturnError(assert.AnError)

	err = r.SaveChunks(context.Background(), []*model.ChunkEmbedding{{ChunkID: "c1"}})
	assert.Error(t, err)
}

func TestEmbeddingRepo_DeleteChunksByDocID(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnResult(sqlmock.NewResult(0, 3))

	err = r.DeleteChunksByDocID(context.Background(), "d1")
	require.NoError(t, err)
}

func TestEmbeddingRepo_DeleteChunksByDocID_Error(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	mock.ExpectExec("DELETE FROM").WillReturnError(assert.AnError)

	err = r.DeleteChunksByDocID(context.Background(), "d1")
	assert.Error(t, err)
}

func TestEmbeddingRepo_GetByDocID(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	rows := sqlmock.NewRows([]string{"document_id", "user_id", "content_hash", "mtime"}).
		AddRow("d1", "u1", "hash1", int64(1000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	emb, err := r.GetByDocID(context.Background(), "d1")
	require.NoError(t, err)
	assert.Equal(t, "d1", emb.DocumentID)
	assert.Equal(t, "hash1", emb.ContentHash)
}

func TestEmbeddingRepo_GetByDocID_Error(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(sql.ErrNoRows)

	_, err = r.GetByDocID(context.Background(), "missing")
	assert.Error(t, err)
}

func TestEmbeddingRepo_SaveChunks_PrepareError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	mock.ExpectBegin()
	mock.ExpectPrepare("INSERT INTO").WillReturnError(assert.AnError)
	mock.ExpectRollback()

	err = r.SaveChunks(context.Background(), []*model.ChunkEmbedding{
		{ChunkID: "c1", DocumentID: "d1", UserID: "u1", Embedding: []float32{0.1}},
	})
	assert.Error(t, err)
}

func TestEmbeddingRepo_SearchChunks_QueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(assert.AnError)

	_, err = r.SearchChunks(context.Background(), "u1", []float32{0.1, 0.2}, 0.5, 10)
	assert.Error(t, err)
}

func TestEmbeddingRepo_SearchChunks_Success(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	rows := sqlmock.NewRows([]string{"document_id", "score", "chunk_type"}).
		AddRow("d1", float32(0.95), "content").
		AddRow("d2", float32(0.85), "title")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	results, err := r.SearchChunks(context.Background(), "u1", []float32{0.1, 0.2}, 0.5, 10)
	require.NoError(t, err)
	require.Len(t, results, 2)
	assert.Equal(t, "d1", results[0].DocumentID)
	assert.Equal(t, model.ChunkType("content"), results[0].ChunkType)
}

func TestEmbeddingRepo_SaveChunks_ExecError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	mock.ExpectBegin()
	mock.ExpectPrepare("INSERT INTO")
	mock.ExpectExec("INSERT INTO").WillReturnError(assert.AnError)
	mock.ExpectRollback()

	err = r.SaveChunks(context.Background(), []*model.ChunkEmbedding{
		{ChunkID: "c1", DocumentID: "d1", UserID: "u1", Embedding: []float32{0.1}},
	})
	assert.Error(t, err)
}

func TestEmbeddingRepo_SaveChunks_CommitError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	mock.ExpectBegin()
	mock.ExpectPrepare("INSERT INTO")
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit().WillReturnError(assert.AnError)
	mock.ExpectRollback()

	err = r.SaveChunks(context.Background(), []*model.ChunkEmbedding{
		{ChunkID: "c1", DocumentID: "d1", UserID: "u1", Embedding: []float32{0.1}},
	})
	assert.Error(t, err)
}

func TestEmbeddingRepo_SaveChunks_Success(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	mock.ExpectBegin()
	mock.ExpectPrepare("INSERT INTO")
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("INSERT INTO").WillReturnResult(sqlmock.NewResult(2, 1))
	mock.ExpectCommit()

	err = r.SaveChunks(context.Background(), []*model.ChunkEmbedding{
		{ChunkID: "c1", DocumentID: "d1", UserID: "u1", Embedding: []float32{0.1, 0.2}},
		{ChunkID: "c2", DocumentID: "d1", UserID: "u1", Embedding: []float32{0.3, 0.4}},
	})
	require.NoError(t, err)
}

func TestEmbeddingRepo_SearchChunks_ScanError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	rows := sqlmock.NewRows([]string{"document_id"}).AddRow("d1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	_, err = r.SearchChunks(context.Background(), "u1", []float32{0.1, 0.2}, 0.5, 10)
	assert.Error(t, err)
}

func TestEmbeddingRepo_SearchChunks_RowsErr(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	rows := sqlmock.NewRows([]string{"document_id", "score", "chunk_type"}).
		AddRow("d1", float32(0.95), "content").
		RowError(0, assert.AnError)
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	_, err = r.SearchChunks(context.Background(), "u1", []float32{0.1, 0.2}, 0.5, 10)
	assert.Error(t, err)
}

func TestEmbeddingRepo_ListStaleDocuments_Error(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(assert.AnError)

	_, err = r.ListStaleDocuments(context.Background(), 10, 99999)
	assert.Error(t, err)
}

func TestEmbeddingRepo_ListStaleDocuments(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "title", "content"}).
		AddRow("d1", "u1", "Title1", "Content1")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	docs, err := r.ListStaleDocuments(context.Background(), 10, 99999)
	require.NoError(t, err)
	require.Len(t, docs, 1)
	assert.Equal(t, "d1", docs[0].ID)
}
