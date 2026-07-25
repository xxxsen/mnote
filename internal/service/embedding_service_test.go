package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/repo"
)

type mockEmbedder struct {
	embedFn func(ctx context.Context, text, taskType string) ([]float32, error)
}

func (m *mockEmbedder) Embed(ctx context.Context, text, taskType string) ([]float32, error) {
	if m.embedFn == nil {
		return nil, nil
	}
	return m.embedFn(ctx, text, taskType)
}

func (m *mockEmbedder) ModelName() string {
	return "test-embedding"
}

type mockEmbeddingChunker struct {
	chunkFn func(ctx context.Context, markdown string) ([]*model.ChunkEmbedding, error)
}

func (m *mockEmbeddingChunker) Chunk(ctx context.Context, markdown string) ([]*model.ChunkEmbedding, error) {
	return m.chunkFn(ctx, markdown)
}

type mockEmbeddingRepo struct {
	saveFn                       func(ctx context.Context, emb *model.DocumentEmbedding) error
	saveChunksFn                 func(ctx context.Context, chunks []*model.ChunkEmbedding) error
	deleteChunksByDocIDFn        func(ctx context.Context, docID string) error
	searchChunksFn               func(ctx context.Context, userID string, query []float32, threshold float32, topK int) ([]repo.ChunkSearchResult, error)
	getByDocIDFn                 func(ctx context.Context, docID string) (*model.DocumentEmbedding, error)
	listStaleDocumentsFn         func(ctx context.Context, limit int, now int64) ([]model.Document, error)
	upsertPendingFn              func(ctx context.Context, docID, userID, contentHash string, contentMtime int64) error
	resetLeaseToPendingFn        func(ctx context.Context, docID string) error
	claimFn                      func(ctx context.Context, docID string, lockedUntil, now int64) (bool, error)
	claimDriftFn                 func(ctx context.Context, docID, documentHash string, lockedUntil, now int64) (bool, error)
	markFailedFn                 func(ctx context.Context, docID, errMsg string, nextRetryAt int64) error
	completeEmbeddingIfCurrentFn func(ctx context.Context, userID, docID, expectedHash string, chunks []*model.ChunkEmbedding, now int64) (bool, error)
}

func (m *mockEmbeddingRepo) Save(ctx context.Context, emb *model.DocumentEmbedding) error {
	if m.saveFn == nil {
		return nil
	}
	return m.saveFn(ctx, emb)
}

func (m *mockEmbeddingRepo) SaveChunks(ctx context.Context, chunks []*model.ChunkEmbedding) error {
	if m.saveChunksFn == nil {
		return nil
	}
	return m.saveChunksFn(ctx, chunks)
}

func (m *mockEmbeddingRepo) DeleteChunksByDocID(ctx context.Context, docID string) error {
	if m.deleteChunksByDocIDFn == nil {
		return nil
	}
	return m.deleteChunksByDocIDFn(ctx, docID)
}

func (m *mockEmbeddingRepo) SearchChunks(
	ctx context.Context, userID string, query []float32, threshold float32, topK int,
) ([]repo.ChunkSearchResult, error) {
	return m.searchChunksFn(ctx, userID, query, threshold, topK)
}

func (m *mockEmbeddingRepo) GetByDocID(ctx context.Context, docID string) (*model.DocumentEmbedding, error) {
	if m.getByDocIDFn == nil {
		return nil, appErr.ErrNotFound
	}
	return m.getByDocIDFn(ctx, docID)
}

func (m *mockEmbeddingRepo) ListStaleDocuments(ctx context.Context, limit int, now int64) ([]model.Document, error) {
	if m.listStaleDocumentsFn == nil {
		return nil, nil
	}
	return m.listStaleDocumentsFn(ctx, limit, now)
}

func (m *mockEmbeddingRepo) UpsertPending(
	ctx context.Context, docID, userID, contentHash string, contentMtime int64,
) error {
	if m.upsertPendingFn == nil {
		return nil
	}
	return m.upsertPendingFn(ctx, docID, userID, contentHash, contentMtime)
}

func (m *mockEmbeddingRepo) Claim(
	ctx context.Context, docID string, lockedUntil, now int64,
) (bool, error) {
	if m.claimFn == nil {
		return true, nil
	}
	return m.claimFn(ctx, docID, lockedUntil, now)
}

func (m *mockEmbeddingRepo) ClaimDrift(
	ctx context.Context, docID, documentHash string, lockedUntil, now int64,
) (bool, error) {
	if m.claimDriftFn == nil {
		return false, nil
	}
	return m.claimDriftFn(ctx, docID, documentHash, lockedUntil, now)
}

func (m *mockEmbeddingRepo) ResetLeaseToPending(ctx context.Context, docID string) error {
	if m.resetLeaseToPendingFn == nil {
		return nil
	}
	return m.resetLeaseToPendingFn(ctx, docID)
}

func (m *mockEmbeddingRepo) MarkFailed(
	ctx context.Context, docID, errMsg string, nextRetryAt int64,
) error {
	if m.markFailedFn == nil {
		return nil
	}
	return m.markFailedFn(ctx, docID, errMsg, nextRetryAt)
}

// CompleteEmbeddingIfCurrent mirrors repo.EmbeddingRepo's completion
// helper. Default behavior (no fn injected) is "applied=true so the
// caller's success path runs", matching what the legacy tests expected
// before the helper existed.
func (m *mockEmbeddingRepo) CompleteEmbeddingIfCurrent(
	ctx context.Context, userID, docID, expectedHash string,
	chunks []*model.ChunkEmbedding, now int64,
) (bool, error) {
	if m.completeEmbeddingIfCurrentFn == nil {
		return true, nil
	}
	return m.completeEmbeddingIfCurrentFn(ctx, userID, docID, expectedHash, chunks, now)
}

func newTestEmbeddingService(mgr *mockEmbedder, emb *mockEmbeddingRepo, chunker *mockEmbeddingChunker) *EmbeddingService {
	return newEmbeddingServiceFromInterfaces(mgr, emb, chunker)
}

func TestEmbeddingService_Embed(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		mgr := &mockEmbedder{
			embedFn: func(_ context.Context, _, _ string) ([]float32, error) {
				return []float32{0.1, 0.2, 0.3}, nil
			},
		}
		svc := newTestEmbeddingService(mgr, nil, nil)
		emb, err := svc.Embed(context.Background(), "test", "RETRIEVAL_QUERY")
		require.NoError(t, err)
		assert.Len(t, emb, 3)
	})

	t.Run("error", func(t *testing.T) {
		mgr := &mockEmbedder{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return nil, errors.New("embed fail")
			},
		}
		svc := newTestEmbeddingService(mgr, nil, nil)
		_, err := svc.Embed(context.Background(), "test", "RETRIEVAL_QUERY")
		assert.Error(t, err)
	})
}

func TestEmbeddingService_SyncEmbedding(t *testing.T) {
	t.Run("nil_service", func(t *testing.T) {
		var svc *EmbeddingService
		err := svc.SyncEmbedding(context.Background(), "u1", "d1", "title", "content")
		require.NoError(t, err)
	})

	t.Run("nil_embeddings", func(t *testing.T) {
		svc := &EmbeddingService{}
		err := svc.SyncEmbedding(context.Background(), "u1", "d1", "title", "content")
		require.NoError(t, err)
	})

	t.Run("content_hash_unchanged_and_succeeded", func(t *testing.T) {
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(_ context.Context, _ string) (*model.DocumentEmbedding, error) {
				return &model.DocumentEmbedding{
					ContentHash:     "cb51c2a06d6d89a675c4e1116e4c4d0243f095c52234a302c1e0771a78bf5e36",
					EmbeddingStatus: model.EmbeddingStatusSucceeded,
				}, nil
			},
		}
		mgr := &mockEmbedder{}
		svc := newTestEmbeddingService(mgr, emb, nil)
		err := svc.SyncEmbedding(context.Background(), "u1", "d1", "title", "content")
		require.NoError(t, err)
	})

	t.Run("success_new_content", func(t *testing.T) {
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return nil, errors.New("not found")
			},
			completeEmbeddingIfCurrentFn: func(
				context.Context, string, string, string, []*model.ChunkEmbedding, int64,
			) (bool, error) {
				return true, nil
			},
		}
		mgr := &mockEmbedder{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return []float32{0.1, 0.2}, nil
			},
		}
		chunker := &mockEmbeddingChunker{
			chunkFn: func(context.Context, string) ([]*model.ChunkEmbedding, error) {
				return []*model.ChunkEmbedding{
					{Content: "chunk1", Position: 0, TokenCount: 10},
				}, nil
			},
		}
		svc := newTestEmbeddingService(mgr, emb, chunker)
		err := svc.SyncEmbedding(context.Background(), "u1", "d1", "title", "new content")
		require.NoError(t, err)
	})

	t.Run("chunk_error", func(t *testing.T) {
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return nil, errors.New("not found")
			},
		}
		mgr := &mockEmbedder{}
		chunker := &mockEmbeddingChunker{
			chunkFn: func(context.Context, string) ([]*model.ChunkEmbedding, error) {
				return nil, errors.New("chunk fail")
			},
		}
		svc := newTestEmbeddingService(mgr, emb, chunker)
		err := svc.SyncEmbedding(context.Background(), "u1", "d1", "t", "c")
		assert.Error(t, err)
	})

	t.Run("embed_chunk_error", func(t *testing.T) {
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return nil, errors.New("not found")
			},
		}
		mgr := &mockEmbedder{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return nil, errors.New("embed fail")
			},
		}
		chunker := &mockEmbeddingChunker{
			chunkFn: func(context.Context, string) ([]*model.ChunkEmbedding, error) {
				return []*model.ChunkEmbedding{{Content: "c1", Position: 0}}, nil
			},
		}
		svc := newTestEmbeddingService(mgr, emb, chunker)
		err := svc.SyncEmbedding(context.Background(), "u1", "d1", "t", "c")
		assert.Error(t, err)
	})

	// completes_via_complete_embedding_if_current guards the worker-side
	// contract that SyncEmbedding hands chunks to the
	// CompleteEmbeddingIfCurrent helper together with the expected
	// snapshot hash. The repo helper owns the SELECT FOR UPDATE
	// transaction; the service must just supply the right inputs and
	// return cleanly when the helper reports applied=true.
	t.Run("completes_via_complete_embedding_if_current", func(t *testing.T) {
		var capturedUser, capturedDoc, capturedHash string
		var capturedChunks []*model.ChunkEmbedding
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return nil, errors.New("not found")
			},
			completeEmbeddingIfCurrentFn: func(
				_ context.Context, userID, docID, hash string,
				chunks []*model.ChunkEmbedding, _ int64,
			) (bool, error) {
				capturedUser = userID
				capturedDoc = docID
				capturedHash = hash
				capturedChunks = chunks
				return true, nil
			},
		}
		mgr := &mockEmbedder{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return []float32{0.1}, nil
			},
		}
		chunker := &mockEmbeddingChunker{
			chunkFn: func(context.Context, string) ([]*model.ChunkEmbedding, error) {
				return []*model.ChunkEmbedding{{Content: "c1", Position: 0}}, nil
			},
		}
		svc := newTestEmbeddingService(mgr, emb, chunker)
		err := svc.SyncEmbedding(context.Background(), "u1", "d1", "t", "c")
		require.NoError(t, err)
		assert.Equal(t, "u1", capturedUser)
		assert.Equal(t, "d1", capturedDoc)
		assert.Equal(t, computeEmbeddingHash("t", "c"), capturedHash)
		require.Len(t, capturedChunks, 1)
		assert.Equal(t, "d1", capturedChunks[0].DocumentID)
	})

	// stale_returns_err_embedding_stale guards the worker race fix: when
	// the documents row has moved on since the worker took its snapshot,
	// CompleteEmbeddingIfCurrent reports applied=false and SyncEmbedding
	// must surface errEmbeddingStale instead of pretending success.
	t.Run("stale_returns_err_embedding_stale", func(t *testing.T) {
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return nil, errors.New("not found")
			},
			completeEmbeddingIfCurrentFn: func(
				context.Context, string, string, string, []*model.ChunkEmbedding, int64,
			) (bool, error) {
				return false, nil
			},
		}
		mgr := &mockEmbedder{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return []float32{0.1}, nil
			},
		}
		chunker := &mockEmbeddingChunker{
			chunkFn: func(context.Context, string) ([]*model.ChunkEmbedding, error) {
				return []*model.ChunkEmbedding{{Content: "c1", Position: 0}}, nil
			},
		}
		svc := newTestEmbeddingService(mgr, emb, chunker)
		err := svc.SyncEmbedding(context.Background(), "u1", "d1", "t", "c")
		require.Error(t, err)
		assert.ErrorIs(t, err, errEmbeddingStale)
	})

	// propagates_complete_error ensures a transaction failure inside
	// CompleteEmbeddingIfCurrent surfaces as a regular (non-stale) error
	// so the worker can record a retry attempt.
	t.Run("propagates_complete_error", func(t *testing.T) {
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return nil, errors.New("not found")
			},
			completeEmbeddingIfCurrentFn: func(
				context.Context, string, string, string, []*model.ChunkEmbedding, int64,
			) (bool, error) {
				return false, errors.New("tx commit failed")
			},
		}
		mgr := &mockEmbedder{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return []float32{0.1}, nil
			},
		}
		chunker := &mockEmbeddingChunker{
			chunkFn: func(context.Context, string) ([]*model.ChunkEmbedding, error) {
				return []*model.ChunkEmbedding{{Content: "c1", Position: 0}}, nil
			},
		}
		svc := newTestEmbeddingService(mgr, emb, chunker)
		err := svc.SyncEmbedding(context.Background(), "u1", "d1", "t", "c")
		require.Error(t, err)
		assert.NotErrorIs(t, err, errEmbeddingStale)
		assert.Contains(t, err.Error(), "complete embedding")
	})
}

func TestEmbeddingService_SemanticSearch(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		mgr := &mockEmbedder{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return []float32{0.1, 0.2}, nil
			},
		}
		emb := &mockEmbeddingRepo{
			searchChunksFn: func(context.Context, string, []float32, float32, int) ([]repo.ChunkSearchResult, error) {
				return []repo.ChunkSearchResult{
					{DocumentID: "d1", Score: 0.9, ChunkType: model.ChunkTypeText},
					{DocumentID: "d2", Score: 0.8, ChunkType: model.ChunkTypeText},
				}, nil
			},
		}
		svc := newTestEmbeddingService(mgr, emb, nil)
		ids, scores, err := svc.SemanticSearch(context.Background(), "u1", "query", 10, "")
		require.NoError(t, err)
		assert.Len(t, ids, 2)
		assert.Len(t, scores, 2)
	})

	t.Run("trimmed_query_used", func(t *testing.T) {
		var receivedQuery string
		mgr := &mockEmbedder{
			embedFn: func(_ context.Context, text, _ string) ([]float32, error) {
				receivedQuery = text
				return []float32{0.1}, nil
			},
		}
		emb := &mockEmbeddingRepo{
			searchChunksFn: func(context.Context, string, []float32, float32, int) ([]repo.ChunkSearchResult, error) {
				return nil, nil
			},
		}
		svc := newTestEmbeddingService(mgr, emb, nil)
		_, _, err := svc.SemanticSearch(context.Background(), "u1", "  hello  ", 10, "")
		require.NoError(t, err)
		assert.Equal(t, "hello", receivedQuery)
	})

	t.Run("embed_error", func(t *testing.T) {
		mgr := &mockEmbedder{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return nil, errors.New("embed fail")
			},
		}
		svc := newTestEmbeddingService(mgr, nil, nil)
		_, _, err := svc.SemanticSearch(context.Background(), "u1", "query", 10, "")
		assert.Error(t, err)
	})

	t.Run("search_error", func(t *testing.T) {
		mgr := &mockEmbedder{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return []float32{0.1}, nil
			},
		}
		emb := &mockEmbeddingRepo{
			searchChunksFn: func(context.Context, string, []float32, float32, int) ([]repo.ChunkSearchResult, error) {
				return nil, errors.New("search fail")
			},
		}
		svc := newTestEmbeddingService(mgr, emb, nil)
		_, _, err := svc.SemanticSearch(context.Background(), "u1", "query", 10, "")
		assert.Error(t, err)
	})

	t.Run("no_results", func(t *testing.T) {
		mgr := &mockEmbedder{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return []float32{0.1}, nil
			},
		}
		emb := &mockEmbeddingRepo{
			searchChunksFn: func(context.Context, string, []float32, float32, int) ([]repo.ChunkSearchResult, error) {
				return nil, nil
			},
		}
		svc := newTestEmbeddingService(mgr, emb, nil)
		ids, scores, err := svc.SemanticSearch(context.Background(), "u1", "query", 10, "")
		require.NoError(t, err)
		assert.Empty(t, ids)
		assert.Empty(t, scores)
	})

	t.Run("with_exclude", func(t *testing.T) {
		mgr := &mockEmbedder{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return []float32{0.1}, nil
			},
		}
		emb := &mockEmbeddingRepo{
			searchChunksFn: func(context.Context, string, []float32, float32, int) ([]repo.ChunkSearchResult, error) {
				return []repo.ChunkSearchResult{
					{DocumentID: "d1", Score: 0.9, ChunkType: model.ChunkTypeText},
					{DocumentID: "d2", Score: 0.8, ChunkType: model.ChunkTypeText},
				}, nil
			},
		}
		svc := newTestEmbeddingService(mgr, emb, nil)
		ids, _, err := svc.SemanticSearch(context.Background(), "u1", "query", 10, "d1")
		require.NoError(t, err)
		assert.Len(t, ids, 1)
		assert.Equal(t, "d2", ids[0])
	})

	t.Run("topk_limit", func(t *testing.T) {
		mgr := &mockEmbedder{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return []float32{0.1}, nil
			},
		}
		emb := &mockEmbeddingRepo{
			searchChunksFn: func(context.Context, string, []float32, float32, int) ([]repo.ChunkSearchResult, error) {
				return []repo.ChunkSearchResult{
					{DocumentID: "d1", Score: 0.95, ChunkType: model.ChunkTypeText},
					{DocumentID: "d2", Score: 0.9, ChunkType: model.ChunkTypeText},
					{DocumentID: "d3", Score: 0.85, ChunkType: model.ChunkTypeText},
				}, nil
			},
		}
		svc := newTestEmbeddingService(mgr, emb, nil)
		ids, _, err := svc.SemanticSearch(context.Background(), "u1", "query", 2, "")
		require.NoError(t, err)
		assert.Len(t, ids, 2)
	})
}

func TestEmbeddingService_ProcessPendingEmbeddings(t *testing.T) {
	t.Run("nil_service", func(t *testing.T) {
		var svc *EmbeddingService
		err := svc.ProcessPendingEmbeddings(context.Background(), 60)
		require.NoError(t, err)
	})

	t.Run("nil_embeddings", func(t *testing.T) {
		svc := &EmbeddingService{}
		err := svc.ProcessPendingEmbeddings(context.Background(), 60)
		require.NoError(t, err)
	})

	t.Run("no_stale_docs", func(t *testing.T) {
		emb := &mockEmbeddingRepo{
			listStaleDocumentsFn: func(context.Context, int, int64) ([]model.Document, error) {
				return nil, nil
			},
		}
		svc := newTestEmbeddingService(&mockEmbedder{}, emb, nil)
		err := svc.ProcessPendingEmbeddings(context.Background(), 60)
		require.NoError(t, err)
	})

	t.Run("list_error", func(t *testing.T) {
		emb := &mockEmbeddingRepo{
			listStaleDocumentsFn: func(context.Context, int, int64) ([]model.Document, error) {
				return nil, errors.New("db error")
			},
		}
		svc := newTestEmbeddingService(&mockEmbedder{}, emb, nil)
		err := svc.ProcessPendingEmbeddings(context.Background(), 60)
		assert.Error(t, err)
	})

	t.Run("context_canceled", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		emb := &mockEmbeddingRepo{
			listStaleDocumentsFn: func(context.Context, int, int64) ([]model.Document, error) {
				return []model.Document{{ID: "d1", UserID: "u1"}}, nil
			},
		}
		svc := newTestEmbeddingService(&mockEmbedder{}, emb, nil)
		err := svc.ProcessPendingEmbeddings(ctx, 60)
		assert.Error(t, err)
	})
}

func TestEmbeddingService_ProcessOneEmbedding(t *testing.T) {
	t.Run("success_marks_succeeded", func(t *testing.T) {
		completed := false
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return nil, appErr.ErrNotFound
			},
			completeEmbeddingIfCurrentFn: func(
				_ context.Context, _, _, hash string,
				_ []*model.ChunkEmbedding, _ int64,
			) (bool, error) {
				completed = true
				assert.NotEmpty(t, hash)
				return true, nil
			},
		}
		mgr := &mockEmbedder{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return []float32{0.1}, nil
			},
		}
		chunker := &mockEmbeddingChunker{
			chunkFn: func(context.Context, string) ([]*model.ChunkEmbedding, error) {
				return []*model.ChunkEmbedding{{Content: "c1", Position: 0}}, nil
			},
		}
		svc := newTestEmbeddingService(mgr, emb, chunker)
		doc := model.Document{ID: "d1", UserID: "u1", Title: "T", Content: "C"}
		processed, err := svc.processOneEmbedding(context.Background(), doc)
		require.NoError(t, err)
		assert.True(t, processed)
		assert.True(t, completed)
	})

	t.Run("rate_limit_does_not_consume_attempt", func(t *testing.T) {
		failedCalled := false
		mgr := &mockEmbedder{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return nil, errors.New("rate limit exceeded")
			},
		}
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return nil, appErr.ErrNotFound
			},
			markFailedFn: func(context.Context, string, string, int64) error {
				failedCalled = true
				return nil
			},
		}
		chunker := &mockEmbeddingChunker{
			chunkFn: func(context.Context, string) ([]*model.ChunkEmbedding, error) {
				return []*model.ChunkEmbedding{{Content: "c1", Position: 0}}, nil
			},
		}
		svc := newTestEmbeddingService(mgr, emb, chunker)
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		doc := model.Document{ID: "d1", UserID: "u1", Title: "T", Content: "C"}
		_, err := svc.processOneEmbedding(ctx, doc)
		require.Error(t, err)
		assert.False(t, failedCalled, "rate-limit failures must not consume a retry attempt")
	})

	t.Run("non_rate_limit_marks_failed_and_backs_off", func(t *testing.T) {
		var retryAt int64
		var errMsg string
		mgr := &mockEmbedder{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return nil, errors.New("internal error")
			},
		}
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return &model.DocumentEmbedding{
					DocumentID: "d1", Attempts: 0,
					EmbeddingStatus: model.EmbeddingStatusPending,
				}, nil
			},
			markFailedFn: func(_ context.Context, _, msg string, nextRetryAt int64) error {
				retryAt = nextRetryAt
				errMsg = msg
				return nil
			},
		}
		chunker := &mockEmbeddingChunker{
			chunkFn: func(context.Context, string) ([]*model.ChunkEmbedding, error) {
				return []*model.ChunkEmbedding{{Content: "c1", Position: 0}}, nil
			},
		}
		svc := newTestEmbeddingService(mgr, emb, chunker)
		doc := model.Document{ID: "d1", UserID: "u1", Title: "T", Content: "C"}
		processed, err := svc.processOneEmbedding(context.Background(), doc)
		require.NoError(t, err)
		assert.True(t, processed)
		assert.Greater(t, retryAt, int64(0))
		assert.Contains(t, errMsg, "internal error")
	})
}

// TestEmbeddingService_MarkEmbeddingPending exercises the wrapper used by the
// save transaction. It covers (a) the nil-service no-op, (b) the empty
// embeddings no-op, (c) the success path, and (d) error wrapping.
func TestEmbeddingService_MarkEmbeddingPending(t *testing.T) {
	t.Run("nil_service", func(t *testing.T) {
		var svc *EmbeddingService
		require.NoError(t, svc.MarkEmbeddingPending(context.Background(), "u", "d", "h", 1))
	})
	t.Run("nil_embeddings", func(t *testing.T) {
		svc := &EmbeddingService{}
		require.NoError(t, svc.MarkEmbeddingPending(context.Background(), "u", "d", "h", 1))
	})
	t.Run("success", func(t *testing.T) {
		var captured struct {
			docID, userID, hash string
			mtime               int64
		}
		emb := &mockEmbeddingRepo{
			upsertPendingFn: func(_ context.Context, docID, userID, hash string, mtime int64) error {
				captured.docID = docID
				captured.userID = userID
				captured.hash = hash
				captured.mtime = mtime
				return nil
			},
		}
		svc := newTestEmbeddingService(&mockEmbedder{}, emb, nil)
		require.NoError(t, svc.MarkEmbeddingPending(context.Background(), "u1", "d1", "hash", 5000))
		assert.Equal(t, "d1", captured.docID)
		assert.Equal(t, "u1", captured.userID)
		assert.Equal(t, "hash", captured.hash)
		assert.Equal(t, int64(5000), captured.mtime)
	})
	t.Run("error_is_wrapped", func(t *testing.T) {
		emb := &mockEmbeddingRepo{
			upsertPendingFn: func(context.Context, string, string, string, int64) error {
				return errors.New("disk full")
			},
		}
		svc := newTestEmbeddingService(&mockEmbedder{}, emb, nil)
		err := svc.MarkEmbeddingPending(context.Background(), "u", "d", "h", 1)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "upsert pending")
	})
}

// TestEmbeddingService_ClaimEmbedding exercises the claim/lease branches that
// were missed by the higher-level processOneEmbedding tests: a seed insert
// when no row exists yet, a hard failure from GetByDocID, a failure from
// the initial seed write, and a Claim that loses the race (returns false).
func TestEmbeddingService_ClaimEmbedding(t *testing.T) {
	t.Run("seeds_pending_when_missing", func(t *testing.T) {
		seeded := false
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return nil, appErr.ErrNotFound
			},
			upsertPendingFn: func(context.Context, string, string, string, int64) error {
				seeded = true
				return nil
			},
			claimFn: func(context.Context, string, int64, int64) (bool, error) { return true, nil },
		}
		svc := newTestEmbeddingService(&mockEmbedder{}, emb, nil)
		ok, err := svc.claimEmbedding(context.Background(), model.Document{ID: "d1", UserID: "u1"}, 0)
		require.NoError(t, err)
		assert.True(t, ok)
		assert.True(t, seeded)
	})
	t.Run("get_by_doc_id_error_propagates", func(t *testing.T) {
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return nil, errors.New("db down")
			},
		}
		svc := newTestEmbeddingService(&mockEmbedder{}, emb, nil)
		ok, err := svc.claimEmbedding(context.Background(), model.Document{ID: "d1"}, 0)
		require.Error(t, err)
		assert.False(t, ok)
		assert.Contains(t, err.Error(), "get embedding")
	})
	t.Run("seed_failure_propagates", func(t *testing.T) {
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return nil, appErr.ErrNotFound
			},
			upsertPendingFn: func(context.Context, string, string, string, int64) error {
				return errors.New("seed failed")
			},
		}
		svc := newTestEmbeddingService(&mockEmbedder{}, emb, nil)
		_, err := svc.claimEmbedding(context.Background(), model.Document{ID: "d1"}, 0)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "seed pending embedding")
	})
	t.Run("claim_failure_returns_false", func(t *testing.T) {
		// Claim errors are swallowed (logged at warn) and surfaced as
		// "not claimed" so the worker tries the next candidate without
		// crashing the whole queue.
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return &model.DocumentEmbedding{DocumentID: "d1"}, nil
			},
			claimFn: func(context.Context, string, int64, int64) (bool, error) {
				return false, errors.New("locked elsewhere")
			},
		}
		svc := newTestEmbeddingService(&mockEmbedder{}, emb, nil)
		ok, err := svc.claimEmbedding(context.Background(), model.Document{ID: "d1"}, 0)
		require.NoError(t, err)
		assert.False(t, ok)
	})
	t.Run("claim_returns_false_without_error_when_lost", func(t *testing.T) {
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return &model.DocumentEmbedding{DocumentID: "d1"}, nil
			},
			claimFn: func(context.Context, string, int64, int64) (bool, error) { return false, nil },
		}
		svc := newTestEmbeddingService(&mockEmbedder{}, emb, nil)
		ok, err := svc.claimEmbedding(context.Background(), model.Document{ID: "d1"}, 0)
		require.NoError(t, err)
		assert.False(t, ok)
	})
	// drift_path_promotes_succeeded_with_hash_mismatch guards the recovery
	// loop: when Claim returns false (status='succeeded'), claimEmbedding
	// must fall through to ClaimDrift and report the drift claim's
	// result. The hash passed to ClaimDrift MUST be the
	// documents.content_hash value (doc.ContentHash here) the stale
	// scan observed — see ClaimDrift's doc-comment for the rationale.
	t.Run("drift_path_promotes_succeeded_with_hash_mismatch", func(t *testing.T) {
		var driftHash string
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return &model.DocumentEmbedding{DocumentID: "d1", EmbeddingStatus: "succeeded", ContentHash: "old"}, nil
			},
			claimFn: func(context.Context, string, int64, int64) (bool, error) { return false, nil },
			claimDriftFn: func(_ context.Context, _, hash string, _, _ int64) (bool, error) {
				driftHash = hash
				return true, nil
			},
		}
		svc := newTestEmbeddingService(&mockEmbedder{}, emb, nil)
		doc := model.Document{
			ID: "d1", Title: "t", Content: "c", ContentHash: "doc-content-hash",
		}
		ok, err := svc.claimEmbedding(context.Background(), doc, 0)
		require.NoError(t, err)
		assert.True(t, ok)
		assert.Equal(t, "doc-content-hash", driftHash,
			"ClaimDrift must receive documents.content_hash, not a recomputed title/content hash")
	})

	// drift_uses_documents_content_hash_when_embedding_hash_matches_title_content
	// pins the exact symptom guarded by the documents.content_hash
	// drift fix. Setup mirrors a documents row whose content_hash is
	// corrupted ("bad-doc-hash") while the embedding row's content_hash
	// is already the freshly-computed title/content hash. The stale
	// scan returns this row because the two columns disagree, but if
	// the worker computed expectedHash from title/content and passed
	// it to ClaimDrift, the row would never be claimed (the row's
	// content_hash already equals that recomputed value). Passing
	// doc.ContentHash ("bad-doc-hash") instead lets ClaimDrift's
	// "content_hash <> $4" predicate match and the worker can proceed
	// to repair documents.content_hash via the completion path.
	t.Run("drift_uses_documents_content_hash_when_embedding_hash_matches_title_content", func(t *testing.T) {
		titleContentHash := computeEmbeddingHash("title", "body")
		var driftHash string
		var claimDriftCalls int
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return &model.DocumentEmbedding{
					DocumentID:      "d1",
					EmbeddingStatus: model.EmbeddingStatusSucceeded,
					// embedding row already records the correct
					// title/content fingerprint; the divergence is
					// entirely on the documents.content_hash side.
					ContentHash: titleContentHash,
				}, nil
			},
			claimFn: func(context.Context, string, int64, int64) (bool, error) { return false, nil },
			claimDriftFn: func(_ context.Context, _, hash string, _, _ int64) (bool, error) {
				claimDriftCalls++
				driftHash = hash
				return true, nil
			},
		}
		svc := newTestEmbeddingService(&mockEmbedder{}, emb, nil)
		doc := model.Document{
			ID:           "d1",
			UserID:       "u1",
			Title:        "title",
			Content:      "body",
			ContentHash:  "bad-doc-hash",
			ContentMtime: 1000,
		}
		ok, err := svc.claimEmbedding(context.Background(), doc, 0)
		require.NoError(t, err)
		assert.True(t, ok, "claim must succeed via drift recovery")
		assert.Equal(t, 1, claimDriftCalls)
		assert.Equal(t, "bad-doc-hash", driftHash,
			"ClaimDrift must bind doc.ContentHash to $4 — passing a recomputed hash would leave the row unclaimable")
		assert.NotEqual(t, titleContentHash, driftHash,
			"the bound hash must NOT be the freshly-computed title/content hash (that would equal the embedding row's hash and skip the claim)")
	})
	// drift_path_error_returns_false swallows errors from the drift claim
	// path so the worker can move on to the next candidate instead of
	// crashing the queue.
	t.Run("drift_path_error_returns_false", func(t *testing.T) {
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return &model.DocumentEmbedding{DocumentID: "d1", EmbeddingStatus: "succeeded"}, nil
			},
			claimFn: func(context.Context, string, int64, int64) (bool, error) { return false, nil },
			claimDriftFn: func(context.Context, string, string, int64, int64) (bool, error) {
				return false, errors.New("drift db error")
			},
		}
		svc := newTestEmbeddingService(&mockEmbedder{}, emb, nil)
		ok, err := svc.claimEmbedding(context.Background(), model.Document{ID: "d1"}, 0)
		require.NoError(t, err)
		assert.False(t, ok)
	})
}

// TestEmbeddingService_ProcessOneEmbedding_RateLimitResetsLeaseOnly guards the
// rate-limit cool-down path: hitting a 429 must clear the worker lease via
// ResetLeaseToPending without touching content_hash, so the next stale
// scan still sees the row as already up to date and does not loop on it.
func TestEmbeddingService_ProcessOneEmbedding_RateLimitResetsLeaseOnly(t *testing.T) {
	upsertCalled := false
	resetCalled := false
	emb := &mockEmbeddingRepo{
		getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
			return &model.DocumentEmbedding{DocumentID: "d1", ContentHash: "h"}, nil
		},
		claimFn: func(context.Context, string, int64, int64) (bool, error) { return true, nil },
		upsertPendingFn: func(context.Context, string, string, string, int64) error {
			upsertCalled = true
			return nil
		},
		resetLeaseToPendingFn: func(context.Context, string) error {
			resetCalled = true
			return nil
		},
	}
	mgr := &mockEmbedder{
		embedFn: func(context.Context, string, string) ([]float32, error) {
			return nil, errors.New("ai: 429 rate limit exceeded")
		},
	}
	chunker := &mockEmbeddingChunker{
		chunkFn: func(context.Context, string) ([]*model.ChunkEmbedding, error) {
			return []*model.ChunkEmbedding{{Content: "c1", Position: 0}}, nil
		},
	}
	svc := newTestEmbeddingService(mgr, emb, chunker)
	// Use a canceled context so the post-rate-limit waitCtx returns
	// promptly and the test does not idle for 10 seconds.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	processed, _ := svc.processOneEmbedding(ctx, model.Document{ID: "d1", UserID: "u1", Title: "t", Content: "c"})
	assert.False(t, processed)
	assert.True(t, resetCalled, "rate-limit path must call ResetLeaseToPending")
	assert.False(t, upsertCalled, "rate-limit path must not call UpsertPending (would wipe content_hash)")
}

// TestTruncateErr covers the long-message branch of truncateErr; the short
// path is already exercised by processOneEmbedding tests.
func TestTruncateErr(t *testing.T) {
	short := strings.Repeat("x", 10)
	assert.Equal(t, short, truncateErr(short))
	long := strings.Repeat("y", embeddingMaxLastErrorChars+50)
	got := truncateErr(long)
	assert.Equal(t, embeddingMaxLastErrorChars, len(got))
}

// TestEmbeddingService_ProcessOneEmbedding_ClaimLost covers the early return from
// processOneEmbedding when claimEmbedding reports the document is owned by
// another worker (no sync, no failure recorded).
func TestEmbeddingService_ProcessOneEmbedding_ClaimLost(t *testing.T) {
	syncCalled := false
	emb := &mockEmbeddingRepo{
		getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
			return &model.DocumentEmbedding{DocumentID: "d1"}, nil
		},
		claimFn: func(context.Context, string, int64, int64) (bool, error) { return false, nil },
	}
	mgr := &mockEmbedder{
		embedFn: func(context.Context, string, string) ([]float32, error) {
			syncCalled = true
			return []float32{0}, nil
		},
	}
	svc := newTestEmbeddingService(mgr, emb, &mockEmbeddingChunker{})
	doc := model.Document{ID: "d1", UserID: "u1", Title: "t", Content: "c"}
	processed, err := svc.processOneEmbedding(context.Background(), doc)
	require.NoError(t, err)
	assert.False(t, processed)
	assert.False(t, syncCalled, "sync must not run when the claim is lost")
}

func TestNewEmbeddingService(t *testing.T) {
	svc := newEmbeddingServiceFromInterfaces(
		&mockEmbedder{},
		&mockEmbeddingRepo{},
		&mockEmbeddingChunker{},
	)
	assert.NotNil(t, svc)
	assert.NotNil(t, svc.embedder)
	assert.NotNil(t, svc.embeddings)
	assert.NotNil(t, svc.chunker)
}

func TestExtractLinkIDs(t *testing.T) {
	assert.Empty(t, extractLinkIDs("no links"))
	ids := extractLinkIDs("link to /docs/abc-123 and /docs/xyz_456")
	assert.Len(t, ids, 2)
	assert.Contains(t, ids, "abc-123")
	assert.Contains(t, ids, "xyz_456")
}

func TestProcessPendingEmbeddings_ContextCanceled(t *testing.T) {
	emb := &mockEmbeddingRepo{
		listStaleDocumentsFn: func(context.Context, int, int64) ([]model.Document, error) {
			return []model.Document{{ID: "d1", UserID: "u1", Title: "t", Content: "c"}}, nil
		},
	}
	mgr := &mockEmbedder{
		embedFn: func(context.Context, string, string) ([]float32, error) {
			return []float32{0.1}, nil
		},
	}
	chunker := &mockEmbeddingChunker{
		chunkFn: func(context.Context, string) ([]*model.ChunkEmbedding, error) {
			return []*model.ChunkEmbedding{{Content: "c1", Position: 0}}, nil
		},
	}
	svc := newTestEmbeddingService(mgr, emb, chunker)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	err := svc.ProcessPendingEmbeddings(ctx, 0)
	assert.Error(t, err)
}

func TestProcessPendingEmbeddings_ListError(t *testing.T) {
	emb := &mockEmbeddingRepo{
		listStaleDocumentsFn: func(context.Context, int, int64) ([]model.Document, error) {
			return nil, errors.New("db error")
		},
	}
	svc := newTestEmbeddingService(&mockEmbedder{}, emb, &mockEmbeddingChunker{})
	err := svc.ProcessPendingEmbeddings(context.Background(), 0)
	assert.Error(t, err)
}

func TestProcessPendingEmbeddings_EmptyList(t *testing.T) {
	emb := &mockEmbeddingRepo{
		listStaleDocumentsFn: func(context.Context, int, int64) ([]model.Document, error) {
			return nil, nil
		},
	}
	svc := newTestEmbeddingService(&mockEmbedder{}, emb, &mockEmbeddingChunker{})
	err := svc.ProcessPendingEmbeddings(context.Background(), 0)
	assert.NoError(t, err)
}

// TestEmbeddingService_ProcessPendingEmbeddings_DriftLoopBreaksAfterFirstSuccess
// asserts the full closed-loop fix for the "stale forever" bug:
// a document whose embedding row is succeeded-but-drifted must be picked
// up by ClaimDrift, re-embedded by SyncEmbedding, and — crucially — must
// have documents.content_hash synced (via CompleteEmbeddingIfCurrent's
// internal transaction) so the next stale scan no longer reports it.
//
//  1. First call: ListStaleDocuments returns the drift candidate; Claim
//     returns false (status='succeeded'), ClaimDrift returns true, and
//     CompleteEmbeddingIfCurrent commits the new chunks under the
//     documents-row lock (returning applied=true).
//  2. Second call: the mock flips ListStaleDocuments to return empty,
//     simulating the real ListStaleDocuments query no longer matching
//     the row because documents.content_hash now equals the embedding
//     hash. The worker must process zero documents on this pass.
//
// The repo-level mock observes the CompleteEmbeddingIfCurrent call with
// the expected hash, which is the same byte-for-byte fingerprint the
// production query compares against documents.content_hash.
func TestEmbeddingService_ProcessPendingEmbeddings_DriftLoopBreaksAfterFirstSuccess(t *testing.T) {
	// doc.ContentHash mirrors the documents.content_hash snapshot the
	// stale scan returned. ClaimDrift must receive this exact value
	// (not a recomputed title/content hash) so its "content_hash <> $4"
	// check uses the same basis as the scan; see ClaimDrift's
	// doc-comment for the broken-documents.content_hash regression
	// this guards.
	doc := model.Document{
		ID:           "d1",
		UserID:       "u1",
		Title:        "title",
		Content:      "body",
		ContentHash:  "documents-snapshot-hash",
		ContentMtime: 1234,
	}
	expectedSyncHash := computeEmbeddingHash(doc.Title, doc.Content)

	listCalls := 0
	claimCalls := 0
	claimDriftCalls := 0
	var completeCalls []string

	emb := &mockEmbeddingRepo{
		listStaleDocumentsFn: func(context.Context, int, int64) ([]model.Document, error) {
			listCalls++
			if listCalls == 1 {
				return []model.Document{doc}, nil
			}
			return nil, nil
		},
		getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
			return &model.DocumentEmbedding{
				DocumentID:      doc.ID,
				ContentHash:     "old-drifted-hash",
				EmbeddingStatus: model.EmbeddingStatusSucceeded,
			}, nil
		},
		claimFn: func(context.Context, string, int64, int64) (bool, error) {
			claimCalls++
			return false, nil
		},
		claimDriftFn: func(_ context.Context, docID, hash string, _, _ int64) (bool, error) {
			claimDriftCalls++
			assert.Equal(t, doc.ID, docID)
			assert.Equal(t, doc.ContentHash, hash,
				"ClaimDrift must bind the documents.content_hash snapshot, not the recomputed title/content hash")
			return true, nil
		},
		completeEmbeddingIfCurrentFn: func(
			_ context.Context, _, docID, hash string,
			_ []*model.ChunkEmbedding, _ int64,
		) (bool, error) {
			completeCalls = append(completeCalls, docID+"="+hash)
			return true, nil
		},
	}
	mgr := &mockEmbedder{
		embedFn: func(context.Context, string, string) ([]float32, error) {
			return []float32{0.1, 0.2}, nil
		},
	}
	chunker := &mockEmbeddingChunker{
		chunkFn: func(context.Context, string) ([]*model.ChunkEmbedding, error) {
			return []*model.ChunkEmbedding{{Content: "body", Position: 0}}, nil
		},
	}
	svc := newTestEmbeddingService(mgr, emb, chunker)

	require.NoError(t, svc.ProcessPendingEmbeddings(context.Background(), 0))
	assert.Equal(t, 1, listCalls)
	assert.Equal(t, 1, claimCalls, "Claim must have been tried once before ClaimDrift")
	assert.Equal(t, 1, claimDriftCalls, "ClaimDrift must have promoted the succeeded-but-drifted row")
	require.Len(t, completeCalls, 1)
	assert.Equal(t, doc.ID+"="+expectedSyncHash, completeCalls[0],
		"CompleteEmbeddingIfCurrent must run with the worker's snapshot hash (computed from title/content)")

	require.NoError(t, svc.ProcessPendingEmbeddings(context.Background(), 0))
	assert.Equal(t, 2, listCalls)
	assert.Equal(t, 1, claimCalls, "Claim must not run a second time once drift is resolved")
	assert.Equal(t, 1, claimDriftCalls, "ClaimDrift must not run a second time once drift is resolved")
	assert.Len(t, completeCalls, 1, "no extra completion call should occur on the second pass")
}

// TestEmbeddingService_ProcessOneEmbedding_StaleSkipsWithoutMarkFailed guards
// the worker race fix: when a save advances the document between scan
// and completion, CompleteEmbeddingIfCurrent reports applied=false,
// SyncEmbedding returns errEmbeddingStale, and processOneEmbedding must
// treat the stale return as a clean skip — without calling MarkFailed
// (which would flip the row to 'failed' with a backoff and waste a
// retry budget for what is a normal race resolution).
func TestEmbeddingService_ProcessOneEmbedding_StaleSkipsWithoutMarkFailed(t *testing.T) {
	saveCalled := false
	deleteCalled := false
	saveChunksCalled := false
	markFailedCalled := false
	emb := &mockEmbeddingRepo{
		getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
			return &model.DocumentEmbedding{
				DocumentID:      "d1",
				ContentHash:     "h-old",
				EmbeddingStatus: model.EmbeddingStatusPending,
				Attempts:        0,
			}, nil
		},
		claimFn: func(context.Context, string, int64, int64) (bool, error) { return true, nil },
		completeEmbeddingIfCurrentFn: func(
			context.Context, string, string, string, []*model.ChunkEmbedding, int64,
		) (bool, error) {
			return false, nil
		},
		saveFn: func(context.Context, *model.DocumentEmbedding) error {
			saveCalled = true
			return nil
		},
		saveChunksFn: func(context.Context, []*model.ChunkEmbedding) error {
			saveChunksCalled = true
			return nil
		},
		deleteChunksByDocIDFn: func(context.Context, string) error {
			deleteCalled = true
			return nil
		},
		markFailedFn: func(context.Context, string, string, int64) error {
			markFailedCalled = true
			return nil
		},
	}
	mgr := &mockEmbedder{
		embedFn: func(context.Context, string, string) ([]float32, error) {
			return []float32{0.1}, nil
		},
	}
	chunker := &mockEmbeddingChunker{
		chunkFn: func(context.Context, string) ([]*model.ChunkEmbedding, error) {
			return []*model.ChunkEmbedding{{Content: "c1", Position: 0}}, nil
		},
	}
	svc := newTestEmbeddingService(mgr, emb, chunker)
	doc := model.Document{ID: "d1", UserID: "u1", Title: "T", Content: "snapshot-A"}
	processed, err := svc.processOneEmbedding(context.Background(), doc)
	require.NoError(t, err)
	assert.False(t, processed,
		"stale completion must not count as processed throughput")
	assert.False(t, markFailedCalled,
		"stale completion must not consume a retry budget")
	assert.False(t, saveCalled, "stale must not call Save(succeeded)")
	assert.False(t, saveChunksCalled, "stale must not call SaveChunks")
	assert.False(t, deleteCalled, "stale must not call DeleteChunksByDocID")
}
