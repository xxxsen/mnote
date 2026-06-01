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
	"github.com/xxxsen/mnote/internal/pkg/dochash"
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
	rows := sqlmock.NewRows([]string{
		"id", "user_id", "title", "content", "content_hash", "content_mtime",
	}).AddRow("d1", "u1", "Title1", "Content1", "hash-d1", int64(2000))
	mock.ExpectQuery("SELECT").WillReturnRows(rows)

	docs, err := r.ListStaleDocuments(context.Background(), 10, 99999)
	require.NoError(t, err)
	require.Len(t, docs, 1)
	assert.Equal(t, "d1", docs[0].ID)
	assert.Equal(t, "hash-d1", docs[0].ContentHash)
	assert.Equal(t, int64(2000), docs[0].ContentMtime)
}

// TestEmbeddingRepo_ListStaleDocuments_QueryShape guards the SQL semantics
// directly: the WHERE clause must use OR between the "no embedding row",
// "pending/failed and not locked" and "succeeded-and-hash-mismatch"
// branches. Two regressions are guarded:
//
//   - Earlier the hash check was AND-coupled to the status check, which
//     silently dropped freshly-saved rows because the save transaction
//     writes the new content_hash and status='pending' in one shot,
//     making the hashes equal at exactly the moment work needed to be
//     dispatched.
//   - More recently the drift branch was not gated by
//     embedding_status='succeeded', so a failed row whose retry window
//     had not yet opened would still match the drift branch (its hash
//     no longer matches documents.content_hash). Neither Claim
//     (next_retry_at > now) nor ClaimDrift (status != 'succeeded') can
//     pick that row up, so the worker would spin on the same candidate
//     scan after scan.
//
// We assert on the literal SQL string exported by the repo so a future
// edit that reintroduces either coupling fails this test loudly. We
// deliberately do not test execution semantics here because sqlmock
// cannot run real SQL.
func TestEmbeddingRepo_ListStaleDocuments_QueryShape(t *testing.T) {
	// Positive: every key fragment of the new OR-based WHERE clause must
	// be present in the SQL.
	for _, frag := range []string{
		"e.document_id IS NULL",
		"e.embedding_status IN ('pending', 'failed')",
		"e.next_retry_at <= $2",
		"e.locked_until < $2",
		"e.embedding_status = 'succeeded'",
		"d.content_hash <> e.content_hash",
		"ORDER BY",
		"LIMIT $3",
	} {
		assert.Contains(t, listStaleDocumentsSQL, frag,
			"ListStaleDocuments SQL is missing required fragment: %s", frag)
	}

	// Negative: the SQL must not couple the hash check with the status
	// check via AND inside the same OR branch — that was the original
	// "freshly-saved rows hidden" regression. The fix uses two
	// independent OR branches for non-null embedding rows: retryable
	// status (no hash check), or succeeded-status drift (hash check).
	bad1 := regexp.MustCompile(
		`d\.content_hash <> e\.content_hash[\s]*AND[\s]*e\.embedding_status IN`)
	bad2 := regexp.MustCompile(
		`e\.embedding_status IN[^)]*\)[\s]*AND[\s]*d\.content_hash <> e\.content_hash`)
	assert.NotRegexp(t, bad1, listStaleDocumentsSQL,
		"hash check must not gate the pending/failed branch")
	assert.NotRegexp(t, bad2, listStaleDocumentsSQL,
		"hash check must not be combined with status check in the same OR branch")

	// Negative: the drift branch must require status='succeeded'. The
	// absence of that gate would let failed rows with a yet-to-elapse
	// retry window match the drift branch, where neither Claim nor
	// ClaimDrift can pick them up.
	drift := regexp.MustCompile(
		`(?s)d\.content_hash <> e\.content_hash[\s]*AND[\s]*e\.locked_until`)
	assert.Regexp(t, drift, listStaleDocumentsSQL,
		"drift branch must combine hash mismatch with the lease check")
	driftWithoutStatus := regexp.MustCompile(
		`(?s)OR[\s]*\([^)]*d\.content_hash <> e\.content_hash[^)]*\)`)
	matches := driftWithoutStatus.FindAllString(listStaleDocumentsSQL, -1)
	for _, match := range matches {
		assert.Contains(t, match, "e.embedding_status = 'succeeded'",
			"drift OR branch must be gated by embedding_status='succeeded'")
	}
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
	rows := sqlmock.NewRows([]string{
		"id", "user_id", "title", "content", "content_hash", "content_mtime",
	}).AddRow("d1", "u1", "T", "C", "hash-d1", int64(12345))
	mock.ExpectQuery(regexp.QuoteMeta("LEFT JOIN document_embeddings e")).
		WithArgs(DocumentStateNormal, int64(12345), 5).
		WillReturnRows(rows)

	docs, err := r.ListStaleDocuments(context.Background(), 5, 12345)
	require.NoError(t, err)
	require.Len(t, docs, 1)
	require.NoError(t, mock.ExpectationsWereMet())
}

// TestEmbeddingRepo_UpsertPending covers the helper that flips a
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

// TestEmbeddingRepo_MarkFailed covers the retry-bookkeeping update on
// the embedding queue row after a failed sync attempt.
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

// TestEmbeddingRepo_Claim covers the atomic lease acquisition used by
// the embedding worker. We assert both branches of the affected-rows
// check (>0 vs 0) plus the underlying exec and RowsAffected error paths.
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

// TestEmbeddingRepo_ClaimDrift exercises the drift-recovery half of the
// embedding lease protocol. ClaimDrift's WHERE clause must match only
// rows whose status is the terminal 'succeeded' AND whose body hash has
// drifted from documents.content_hash AND whose lease has expired, all
// in a single atomic UPDATE so two workers cannot simultaneously promote
// the same drift candidate.
func TestEmbeddingRepo_ClaimDrift(t *testing.T) {
	t.Run("claims_when_drifted_row_present", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer func() { _ = db.Close() }()

		r := NewEmbeddingRepo(db)
		mock.ExpectExec("UPDATE document_embeddings").
			WithArgs("d1", int64(2000), int64(1000), "expected").
			WillReturnResult(sqlmock.NewResult(0, 1))
		ok, err := r.ClaimDrift(context.Background(), "d1", "expected", 2000, 1000)
		require.NoError(t, err)
		assert.True(t, ok)
	})

	t.Run("returns_false_when_nothing_matches", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer func() { _ = db.Close() }()

		r := NewEmbeddingRepo(db)
		mock.ExpectExec("UPDATE document_embeddings").
			WillReturnResult(sqlmock.NewResult(0, 0))
		ok, err := r.ClaimDrift(context.Background(), "d1", "expected", 2000, 1000)
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
		_, err = r.ClaimDrift(context.Background(), "d1", "expected", 2000, 1000)
		require.Error(t, err)
	})

	t.Run("rows_affected_error", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer func() { _ = db.Close() }()

		r := NewEmbeddingRepo(db)
		mock.ExpectExec("UPDATE document_embeddings").
			WillReturnResult(sqlmock.NewErrorResult(assert.AnError))
		_, err = r.ClaimDrift(context.Background(), "d1", "expected", 2000, 1000)
		require.Error(t, err)
	})
}

// TestEmbeddingRepo_ResetLeaseToPending guards the rate-limit cool-down
// path. The query must not touch content_hash or content_mtime — the
// regression that motivated this dedicated helper was an UpsertPending
// call that fed empty strings into those columns and broke the next
// stale scan. Asserting on the exact SQL ensures that contract.
func TestEmbeddingRepo_ResetLeaseToPending(t *testing.T) {
	t.Run("success_clears_lease_only", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer func() { _ = db.Close() }()

		r := NewEmbeddingRepo(db)
		mock.ExpectExec(`UPDATE document_embeddings\s+SET embedding_status = 'pending',\s+locked_until = 0,\s+next_retry_at = 0\s+WHERE document_id = \$1`).
			WithArgs("d1").
			WillReturnResult(sqlmock.NewResult(0, 1))
		require.NoError(t, r.ResetLeaseToPending(context.Background(), "d1"))
		require.NoError(t, mock.ExpectationsWereMet())
	})

	t.Run("propagates_exec_error", func(t *testing.T) {
		db, mock, err := sqlmock.New()
		require.NoError(t, err)
		defer func() { _ = db.Close() }()

		r := NewEmbeddingRepo(db)
		mock.ExpectExec("UPDATE document_embeddings").WillReturnError(assert.AnError)
		require.Error(t, r.ResetLeaseToPending(context.Background(), "d1"))
	})
}

// TestEmbeddingRepo_CompleteEmbeddingIfCurrent_AppliesWhenHashMatches
// guards the happy path: SELECT FOR UPDATE returns a document whose
// computed hash matches expectedHash, so the helper deletes chunks,
// rewrites them, marks the embedding row succeeded, and normalizes
// documents.content_hash. All four writes happen inside a single
// transaction begun by RunInTx.
func TestEmbeddingRepo_CompleteEmbeddingIfCurrent_AppliesWhenHashMatches(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	title := "T"
	content := "C"
	expectedHash := computeDocumentHashForTest(title, content)

	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT title, content, content_mtime\s+FROM documents`).
		WithArgs("d1", "u1", DocumentStateNormal).
		WillReturnRows(sqlmock.NewRows([]string{"title", "content", "content_mtime"}).
			AddRow(title, content, int64(2000)))
	mock.ExpectExec(`DELETE FROM chunk_embeddings WHERE document_id = \$1`).
		WithArgs("d1").
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectPrepare("INSERT INTO chunk_embeddings")
	mock.ExpectExec("INSERT INTO chunk_embeddings").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("INSERT INTO document_embeddings").
		WithArgs("d1", "u1", expectedHash, int64(3000)).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`UPDATE documents SET content_hash = \$2 WHERE id = \$1`).
		WithArgs("d1", expectedHash).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	applied, err := r.CompleteEmbeddingIfCurrent(
		context.Background(), "u1", "d1", expectedHash,
		[]*model.ChunkEmbedding{{
			ChunkID: "c1", DocumentID: "d1", UserID: "u1",
			Content: "chunk", Embedding: []float32{0.1}, Position: 0,
		}},
		3000,
	)
	require.NoError(t, err)
	assert.True(t, applied, "matching hash must apply the worker write")
	require.NoError(t, mock.ExpectationsWereMet())
}

// TestEmbeddingRepo_CompleteEmbeddingIfCurrent_StaleWhenHashDrifted
// guards the race fix: when the locked document hashes to a different
// value than the worker's expected snapshot, the helper must NOT delete
// or rewrite chunks, must NOT mark succeeded, and must NOT update
// documents.content_hash. Instead it re-pends the row under the
// document's current hash so the next stale scan can pick it up.
func TestEmbeddingRepo_CompleteEmbeddingIfCurrent_StaleWhenHashDrifted(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	// Worker computed expectedHash from snapshot A; documents row now
	// contains snapshot B (different title/content).
	expectedHash := computeDocumentHashForTest("A-title", "A-content")
	currentHash := computeDocumentHashForTest("B-title", "B-content")
	require.NotEqual(t, expectedHash, currentHash)

	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT title, content, content_mtime\s+FROM documents`).
		WithArgs("d1", "u1", DocumentStateNormal).
		WillReturnRows(sqlmock.NewRows([]string{"title", "content", "content_mtime"}).
			AddRow("B-title", "B-content", int64(5000)))
	mock.ExpectExec("INSERT INTO document_embeddings").
		WithArgs("d1", "u1", currentHash, int64(5000)).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	applied, err := r.CompleteEmbeddingIfCurrent(
		context.Background(), "u1", "d1", expectedHash,
		[]*model.ChunkEmbedding{{
			ChunkID: "c1", DocumentID: "d1", UserID: "u1",
			Content: "chunk", Embedding: []float32{0.1}, Position: 0,
		}},
		6000,
	)
	require.NoError(t, err)
	assert.False(t, applied,
		"drifted documents row must report stale, not apply")
	require.NoError(t, mock.ExpectationsWereMet())
}

// TestEmbeddingRepo_CompleteEmbeddingIfCurrent_MissingDocument exercises
// the ErrNotFound mapping: when the documents row is missing (deleted,
// wrong user, or non-normal state) the helper must surface ErrNotFound
// instead of pretending the embedding succeeded.
func TestEmbeddingRepo_CompleteEmbeddingIfCurrent_MissingDocument(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT title, content, content_mtime\s+FROM documents`).
		WithArgs("d1", "u1", DocumentStateNormal).
		WillReturnError(sql.ErrNoRows)
	mock.ExpectRollback()

	applied, err := r.CompleteEmbeddingIfCurrent(
		context.Background(), "u1", "d1", "expected", nil, 1000,
	)
	require.Error(t, err)
	assert.False(t, applied)
	require.NoError(t, mock.ExpectationsWereMet())
}

// TestEmbeddingRepo_CompleteEmbeddingIfCurrent_LockQueryError covers the
// generic-DB-error path on the SELECT FOR UPDATE so we observe rollback.
func TestEmbeddingRepo_CompleteEmbeddingIfCurrent_LockQueryError(t *testing.T) {
	db, mock, err := sqlmock.New()
	require.NoError(t, err)
	defer func() { _ = db.Close() }()

	r := NewEmbeddingRepo(db)
	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT title, content, content_mtime\s+FROM documents`).
		WillReturnError(assert.AnError)
	mock.ExpectRollback()

	applied, err := r.CompleteEmbeddingIfCurrent(
		context.Background(), "u1", "d1", "expected", nil, 1000,
	)
	require.Error(t, err)
	assert.False(t, applied)
}

// computeDocumentHashForTest is a thin alias over dochash.Compute kept
// so the tests above read naturally without prefixing every hash with
// the package name. It is intentionally a function call instead of a
// var so go vet does not flag an unused identifier when only some test
// runs reference the helper.
func computeDocumentHashForTest(title, content string) string {
	return dochash.Compute(title, content)
}
