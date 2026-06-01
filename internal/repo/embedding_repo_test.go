package repo

import (
	"context"
	"database/sql"
	"regexp"
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
	rows := sqlmock.NewRows([]string{
		"document_id", "user_id", "content_hash", "mtime",
		"embedding_status", "attempts", "next_retry_at", "locked_until", "last_error",
	}).AddRow("d1", "u1", "hash1", int64(1000), "succeeded", 0, int64(0), int64(0), "")
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	emb, err := r.GetByDocID(context.Background(), "d1")
	require.NoError(t, err)
	assert.Equal(t, "d1", emb.DocumentID)
	assert.Equal(t, "hash1", emb.ContentHash)
	assert.Equal(t, model.EmbeddingStatusSucceeded, emb.EmbeddingStatus)
}

func TestEmbeddingRepo_GetByDocID_NotFound(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	mock.ExpectQuery("SELECT").WillReturnError(sql.ErrNoRows)

	_, err = r.GetByDocID(context.Background(), "missing")
	require.Error(t, err)
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

// TestEmbeddingRepo_ListStaleDocuments_QueryShape guards the SQL semantics
// directly: the WHERE clause must use OR between the "no embedding row",
// "pending/failed and not locked" and "hash mismatch and not locked"
// branches. The earlier implementation used AND between the hash check and
// the status check, which silently dropped freshly-saved rows because the
// save transaction writes the new content_hash and status='pending' in one
// shot, making the hashes equal at exactly the moment the work needed to be
// dispatched. We assert on the literal SQL string exported by the repo so a
// future edit that reintroduces the AND coupling fails this test loudly.
// We deliberately do not test execution semantics here because sqlmock
// cannot run real SQL.
func TestEmbeddingRepo_ListStaleDocuments_QueryShape(t *testing.T) {
	// Positive: every key fragment of the new OR-based WHERE clause must
	// be present in the SQL.
	for _, frag := range []string{
		"e.document_id IS NULL",
		"e.embedding_status IN ('pending', 'failed')",
		"e.next_retry_at <= $2",
		"e.locked_until < $2",
		"d.content_hash <> e.content_hash",
		"ORDER BY",
		"LIMIT $3",
	} {
		assert.Contains(t, listStaleDocumentsSQL, frag,
			"ListStaleDocuments SQL is missing required fragment: %s", frag)
	}

	// Negative: the SQL must not couple the hash check with the status
	// check via AND inside the same OR branch — that was the original
	// P0-2 regression. The fix uses three independent OR branches: NULL,
	// retryable status (no hash check), or hash drift (no status check).
	// Either composite pattern below would re-introduce the original bug.
	bad1 := regexp.MustCompile(
		`d\.content_hash <> e\.content_hash[\s]*AND[\s]*e\.embedding_status IN`)
	bad2 := regexp.MustCompile(
		`e\.embedding_status IN[^)]*\)[\s]*AND[\s]*d\.content_hash <> e\.content_hash`)
	assert.NotRegexp(t, bad1, listStaleDocumentsSQL,
		"hash check must not gate the pending/failed branch")
	assert.NotRegexp(t, bad2, listStaleDocumentsSQL,
		"hash check must not be combined with status check in the same OR branch")
}

// TestEmbeddingRepo_ListStaleDocuments_PassesArgs verifies the repo binds
// the documents.state, now and limit parameters in the expected positional
// order, so the WHERE branches above are evaluated against the right
// values. sqlmock validates the bound args against the underlying query.
func TestEmbeddingRepo_ListStaleDocuments_PassesArgs(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	rows := sqlmock.NewRows([]string{"id", "user_id", "title", "content"}).
		AddRow("d1", "u1", "T", "C")
	mock.ExpectQuery(regexp.QuoteMeta("LEFT JOIN document_embeddings e")).
		WithArgs(DocumentStateNormal, int64(12345), 5).
		WillReturnRows(rows)

	docs, err := r.ListStaleDocuments(context.Background(), 5, 12345)
	require.NoError(t, err)
	require.Len(t, docs, 1)
	require.NoError(t, mock.ExpectationsWereMet())
}

// TestEmbeddingRepo_UpsertPending covers the BE-2 helper that flips a
// document's embedding row back to "pending" inside the save transaction.
// We mock both the success and failure paths.
func TestEmbeddingRepo_UpsertPending(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer func() { _ = db.Close() }()

		r := NewEmbeddingRepo(db)
		mock.ExpectExec("INSERT INTO document_embeddings").
			WithArgs("d1", "u1", "hash", int64(1000)).
			WillReturnResult(sqlmock.NewResult(0, 1))
		require.NoError(t, r.UpsertPending(context.Background(), "d1", "u1", "hash", 1000))
		require.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("error", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer func() { _ = db.Close() }()

		r := NewEmbeddingRepo(db)
		mock.ExpectExec("INSERT INTO document_embeddings").
			WillReturnError(assert.AnError)
		require.Error(t, r.UpsertPending(context.Background(), "d1", "u1", "hash", 1000))
	})
}

// TestEmbeddingRepo_MarkFailed covers the BE-2 retry-bookkeeping update.
func TestEmbeddingRepo_MarkFailed(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer func() { _ = db.Close() }()

		r := NewEmbeddingRepo(db)
		mock.ExpectExec("UPDATE document_embeddings").
			WithArgs("d1", int64(1234), "boom").
			WillReturnResult(sqlmock.NewResult(0, 1))
		require.NoError(t, r.MarkFailed(context.Background(), "d1", "boom", 1234))
		require.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("error", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer func() { _ = db.Close() }()

		r := NewEmbeddingRepo(db)
		mock.ExpectExec("UPDATE document_embeddings").
			WillReturnError(assert.AnError)
		require.Error(t, r.MarkFailed(context.Background(), "d1", "boom", 1234))
	})
}

// TestEmbeddingRepo_Claim covers the BE-2 atomic lease acquisition. We
// assert both branches of the affected-rows check (>0 vs 0) plus the
// underlying exec and RowsAffected error paths.
func TestEmbeddingRepo_Claim(t *testing.T) {
	t.Run("claims_when_row_updated", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer func() { _ = db.Close() }()

		r := NewEmbeddingRepo(db)
		mock.ExpectExec("UPDATE document_embeddings").
			WithArgs("d1", int64(2000), int64(1000)).
			WillReturnResult(sqlmock.NewResult(0, 1))
		ok, err := r.Claim(context.Background(), "d1", 2000, 1000)
		require.NoError(t, err)
		assert.True(t, ok)
	})

	t.Run("returns_false_when_already_held", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer func() { _ = db.Close() }()

		r := NewEmbeddingRepo(db)
		mock.ExpectExec("UPDATE document_embeddings").
			WillReturnResult(sqlmock.NewResult(0, 0))
		ok, err := r.Claim(context.Background(), "d1", 2000, 1000)
		require.NoError(t, err)
		assert.False(t, ok)
	})

	t.Run("exec_error", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer func() { _ = db.Close() }()

		r := NewEmbeddingRepo(db)
		mock.ExpectExec("UPDATE document_embeddings").
			WillReturnError(assert.AnError)
		_, err = r.Claim(context.Background(), "d1", 2000, 1000)
		require.Error(t, err)
	})

	t.Run("rows_affected_error", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer func() { _ = db.Close() }()

		r := NewEmbeddingRepo(db)
		mock.ExpectExec("UPDATE document_embeddings").
			WillReturnResult(sqlmock.NewErrorResult(assert.AnError))
		_, err = r.Claim(context.Background(), "d1", 2000, 1000)
		require.Error(t, err)
	})
}
