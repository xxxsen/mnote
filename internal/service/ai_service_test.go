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

type mockAIManager struct {
	polishFn       func(ctx context.Context, text string) (string, error)
	generateFn     func(ctx context.Context, desc string) (string, error)
	extractTagsFn  func(ctx context.Context, text string, maxTags int) ([]string, error)
	summarizeFn    func(ctx context.Context, text string) (string, error)
	embedFn        func(ctx context.Context, text, taskType string) ([]float32, error)
	maxInputCharFn func() int
}

func (m *mockAIManager) Polish(ctx context.Context, text string) (string, error) {
	return m.polishFn(ctx, text)
}

func (m *mockAIManager) Generate(ctx context.Context, desc string) (string, error) {
	return m.generateFn(ctx, desc)
}

func (m *mockAIManager) ExtractTags(ctx context.Context, text string, maxTags int) ([]string, error) {
	return m.extractTagsFn(ctx, text, maxTags)
}

func (m *mockAIManager) Summarize(ctx context.Context, text string) (string, error) {
	return m.summarizeFn(ctx, text)
}

func (m *mockAIManager) Embed(ctx context.Context, text, taskType string) ([]float32, error) {
	return m.embedFn(ctx, text, taskType)
}

func (m *mockAIManager) MaxInputChars() int {
	if m.maxInputCharFn != nil {
		return m.maxInputCharFn()
	}
	return 0
}

type mockAIChunker struct {
	chunkFn func(ctx context.Context, markdown string) ([]*model.ChunkEmbedding, error)
}

func (m *mockAIChunker) Chunk(ctx context.Context, markdown string) ([]*model.ChunkEmbedding, error) {
	return m.chunkFn(ctx, markdown)
}

type mockEmbeddingRepo struct {
	saveFn                func(ctx context.Context, emb *model.DocumentEmbedding) error
	saveChunksFn          func(ctx context.Context, chunks []*model.ChunkEmbedding) error
	deleteChunksByDocIDFn func(ctx context.Context, docID string) error
	searchChunksFn        func(ctx context.Context, userID string, query []float32, threshold float32, topK int) ([]repo.ChunkSearchResult, error)
	getByDocIDFn          func(ctx context.Context, docID string) (*model.DocumentEmbedding, error)
	listStaleDocumentsFn  func(ctx context.Context, limit int, now int64) ([]model.Document, error)
	upsertPendingFn       func(ctx context.Context, docID, userID, contentHash string, contentMtime int64) error
	claimFn               func(ctx context.Context, docID string, lockedUntil, now int64) (bool, error)
	markFailedFn          func(ctx context.Context, docID, errMsg string, nextRetryAt int64) error
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

func (m *mockEmbeddingRepo) MarkFailed(
	ctx context.Context, docID, errMsg string, nextRetryAt int64,
) error {
	if m.markFailedFn == nil {
		return nil
	}
	return m.markFailedFn(ctx, docID, errMsg, nextRetryAt)
}

func newTestAIService(mgr *mockAIManager, emb *mockEmbeddingRepo, chunker *mockAIChunker) *AIService {
	return newAIServiceFromInterfaces(mgr, emb, chunker)
}

func TestAIService_Polish(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		mgr := &mockAIManager{
			polishFn: func(_ context.Context, text string) (string, error) {
				return "polished: " + text, nil
			},
			maxInputCharFn: func() int { return 0 },
		}
		svc := newTestAIService(mgr, nil, nil)
		result, err := svc.Polish(context.Background(), "hello world")
		require.NoError(t, err)
		assert.Equal(t, "polished: hello world", result)
	})

	t.Run("empty_input", func(t *testing.T) {
		mgr := &mockAIManager{
			maxInputCharFn: func() int { return 0 },
		}
		svc := newTestAIService(mgr, nil, nil)
		result, err := svc.Polish(context.Background(), "   ")
		require.NoError(t, err)
		assert.Empty(t, result)
	})

	t.Run("cached", func(t *testing.T) {
		callCount := 0
		mgr := &mockAIManager{
			polishFn: func(_ context.Context, _ string) (string, error) {
				callCount++
				return "polished", nil
			},
			maxInputCharFn: func() int { return 0 },
		}
		svc := newTestAIService(mgr, nil, nil)
		_, err := svc.Polish(context.Background(), "test")
		require.NoError(t, err)
		result, err := svc.Polish(context.Background(), "test")
		require.NoError(t, err)
		assert.Equal(t, "polished", result)
		assert.Equal(t, 1, callCount)
	})

	t.Run("error", func(t *testing.T) {
		mgr := &mockAIManager{
			polishFn: func(context.Context, string) (string, error) {
				return "", errors.New("ai error")
			},
			maxInputCharFn: func() int { return 0 },
		}
		svc := newTestAIService(mgr, nil, nil)
		_, err := svc.Polish(context.Background(), "test")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "polish")
	})
}

func TestAIService_Generate(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		mgr := &mockAIManager{
			generateFn: func(_ context.Context, desc string) (string, error) {
				return "generated: " + desc, nil
			},
			maxInputCharFn: func() int { return 0 },
		}
		svc := newTestAIService(mgr, nil, nil)
		result, err := svc.Generate(context.Background(), "write about Go")
		require.NoError(t, err)
		assert.Equal(t, "generated: write about Go", result)
	})

	t.Run("empty_input", func(t *testing.T) {
		mgr := &mockAIManager{
			maxInputCharFn: func() int { return 0 },
		}
		svc := newTestAIService(mgr, nil, nil)
		_, err := svc.Generate(context.Background(), "  ")
		assert.ErrorIs(t, err, errInputTextEmpty)
	})

	t.Run("cached", func(t *testing.T) {
		callCount := 0
		mgr := &mockAIManager{
			generateFn: func(context.Context, string) (string, error) {
				callCount++
				return "article", nil
			},
			maxInputCharFn: func() int { return 0 },
		}
		svc := newTestAIService(mgr, nil, nil)
		_, err := svc.Generate(context.Background(), "topic")
		require.NoError(t, err)
		result, err := svc.Generate(context.Background(), "topic")
		require.NoError(t, err)
		assert.Equal(t, "article", result)
		assert.Equal(t, 1, callCount)
	})

	t.Run("error", func(t *testing.T) {
		mgr := &mockAIManager{
			generateFn: func(context.Context, string) (string, error) {
				return "", errors.New("fail")
			},
			maxInputCharFn: func() int { return 0 },
		}
		svc := newTestAIService(mgr, nil, nil)
		_, err := svc.Generate(context.Background(), "test")
		assert.Error(t, err)
	})
}

func TestAIService_Summarize(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		mgr := &mockAIManager{
			summarizeFn: func(_ context.Context, text string) (string, error) {
				return "summary of: " + text, nil
			},
			maxInputCharFn: func() int { return 0 },
		}
		svc := newTestAIService(mgr, nil, nil)
		result, err := svc.Summarize(context.Background(), "long text here")
		require.NoError(t, err)
		assert.Equal(t, "summary of: long text here", result)
	})

	t.Run("empty_input", func(t *testing.T) {
		mgr := &mockAIManager{
			maxInputCharFn: func() int { return 0 },
		}
		svc := newTestAIService(mgr, nil, nil)
		result, err := svc.Summarize(context.Background(), "")
		require.NoError(t, err)
		assert.Empty(t, result)
	})

	t.Run("cached", func(t *testing.T) {
		callCount := 0
		mgr := &mockAIManager{
			summarizeFn: func(context.Context, string) (string, error) {
				callCount++
				return "cached summary", nil
			},
			maxInputCharFn: func() int { return 0 },
		}
		svc := newTestAIService(mgr, nil, nil)
		_, _ = svc.Summarize(context.Background(), "input")
		result, err := svc.Summarize(context.Background(), "input")
		require.NoError(t, err)
		assert.Equal(t, "cached summary", result)
		assert.Equal(t, 1, callCount)
	})

	t.Run("error", func(t *testing.T) {
		mgr := &mockAIManager{
			summarizeFn: func(context.Context, string) (string, error) {
				return "", errors.New("fail")
			},
			maxInputCharFn: func() int { return 0 },
		}
		svc := newTestAIService(mgr, nil, nil)
		_, err := svc.Summarize(context.Background(), "test")
		assert.Error(t, err)
	})
}

func TestAIService_ExtractTags(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		mgr := &mockAIManager{
			extractTagsFn: func(_ context.Context, _ string, _ int) ([]string, error) {
				return []string{"go", "programming"}, nil
			},
			maxInputCharFn: func() int { return 0 },
		}
		svc := newTestAIService(mgr, nil, nil)
		tags, err := svc.ExtractTags(context.Background(), "Go programming tutorial", 5)
		require.NoError(t, err)
		assert.Equal(t, []string{"go", "programming"}, tags)
	})

	t.Run("empty_input", func(t *testing.T) {
		mgr := &mockAIManager{
			maxInputCharFn: func() int { return 0 },
		}
		svc := newTestAIService(mgr, nil, nil)
		tags, err := svc.ExtractTags(context.Background(), "", 5)
		require.NoError(t, err)
		assert.Empty(t, tags)
	})

	t.Run("cached", func(t *testing.T) {
		callCount := 0
		mgr := &mockAIManager{
			extractTagsFn: func(context.Context, string, int) ([]string, error) {
				callCount++
				return []string{"cached"}, nil
			},
			maxInputCharFn: func() int { return 0 },
		}
		svc := newTestAIService(mgr, nil, nil)
		_, _ = svc.ExtractTags(context.Background(), "text", 5)
		tags, err := svc.ExtractTags(context.Background(), "text", 5)
		require.NoError(t, err)
		assert.Equal(t, []string{"cached"}, tags)
		assert.Equal(t, 1, callCount)
	})

	t.Run("error", func(t *testing.T) {
		mgr := &mockAIManager{
			extractTagsFn: func(context.Context, string, int) ([]string, error) {
				return nil, errors.New("fail")
			},
			maxInputCharFn: func() int { return 0 },
		}
		svc := newTestAIService(mgr, nil, nil)
		_, err := svc.ExtractTags(context.Background(), "text", 5)
		assert.Error(t, err)
	})
}

func TestAIService_CleanInput(t *testing.T) {
	mgr := &mockAIManager{
		maxInputCharFn: func() int { return 10 },
	}
	svc := newTestAIService(mgr, nil, nil)

	assert.Empty(t, svc.cleanInput(""))
	assert.Empty(t, svc.cleanInput("   "))
	assert.Equal(t, "hello", svc.cleanInput("  hello  "))
	assert.Equal(t, "0123456789", svc.cleanInput("0123456789extra"))
}

func TestAIService_CleanInput_NoLimit(t *testing.T) {
	mgr := &mockAIManager{
		maxInputCharFn: func() int { return 0 },
	}
	svc := newTestAIService(mgr, nil, nil)
	long := "a very long string that exceeds nothing because limit is zero"
	assert.Equal(t, long, svc.cleanInput(long))
}

func TestAIService_CacheKey(t *testing.T) {
	mgr := &mockAIManager{
		maxInputCharFn: func() int { return 0 },
	}
	svc := newTestAIService(mgr, nil, nil)

	key1 := svc.cacheKey("polish", "hello")
	key2 := svc.cacheKey("polish", "hello")
	key3 := svc.cacheKey("generate", "hello")
	assert.Equal(t, key1, key2)
	assert.NotEqual(t, key1, key3)
}

func TestAIService_Embed(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		mgr := &mockAIManager{
			embedFn: func(_ context.Context, _, _ string) ([]float32, error) {
				return []float32{0.1, 0.2, 0.3}, nil
			},
		}
		svc := newTestAIService(mgr, nil, nil)
		emb, err := svc.Embed(context.Background(), "test", "RETRIEVAL_QUERY")
		require.NoError(t, err)
		assert.Len(t, emb, 3)
	})

	t.Run("error", func(t *testing.T) {
		mgr := &mockAIManager{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return nil, errors.New("embed fail")
			},
		}
		svc := newTestAIService(mgr, nil, nil)
		_, err := svc.Embed(context.Background(), "test", "RETRIEVAL_QUERY")
		assert.Error(t, err)
	})
}

func TestAIService_SyncEmbedding(t *testing.T) {
	t.Run("nil_service", func(t *testing.T) {
		var svc *AIService
		err := svc.SyncEmbedding(context.Background(), "u1", "d1", "title", "content")
		require.NoError(t, err)
	})

	t.Run("nil_embeddings", func(t *testing.T) {
		svc := &AIService{}
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
		mgr := &mockAIManager{
			maxInputCharFn: func() int { return 0 },
		}
		svc := newTestAIService(mgr, emb, nil)
		err := svc.SyncEmbedding(context.Background(), "u1", "d1", "title", "content")
		require.NoError(t, err)
	})

	t.Run("success_new_content", func(t *testing.T) {
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return nil, errors.New("not found")
			},
			deleteChunksByDocIDFn: func(context.Context, string) error { return nil },
			saveChunksFn:          func(context.Context, []*model.ChunkEmbedding) error { return nil },
			saveFn:                func(context.Context, *model.DocumentEmbedding) error { return nil },
		}
		mgr := &mockAIManager{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return []float32{0.1, 0.2}, nil
			},
			maxInputCharFn: func() int { return 0 },
		}
		chunker := &mockAIChunker{
			chunkFn: func(context.Context, string) ([]*model.ChunkEmbedding, error) {
				return []*model.ChunkEmbedding{
					{Content: "chunk1", Position: 0, TokenCount: 10},
				}, nil
			},
		}
		svc := newTestAIService(mgr, emb, chunker)
		err := svc.SyncEmbedding(context.Background(), "u1", "d1", "title", "new content")
		require.NoError(t, err)
	})

	t.Run("chunk_error", func(t *testing.T) {
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return nil, errors.New("not found")
			},
		}
		mgr := &mockAIManager{
			maxInputCharFn: func() int { return 0 },
		}
		chunker := &mockAIChunker{
			chunkFn: func(context.Context, string) ([]*model.ChunkEmbedding, error) {
				return nil, errors.New("chunk fail")
			},
		}
		svc := newTestAIService(mgr, emb, chunker)
		err := svc.SyncEmbedding(context.Background(), "u1", "d1", "t", "c")
		assert.Error(t, err)
	})

	t.Run("embed_chunk_error", func(t *testing.T) {
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return nil, errors.New("not found")
			},
		}
		mgr := &mockAIManager{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return nil, errors.New("embed fail")
			},
			maxInputCharFn: func() int { return 0 },
		}
		chunker := &mockAIChunker{
			chunkFn: func(context.Context, string) ([]*model.ChunkEmbedding, error) {
				return []*model.ChunkEmbedding{{Content: "c1", Position: 0}}, nil
			},
		}
		svc := newTestAIService(mgr, emb, chunker)
		err := svc.SyncEmbedding(context.Background(), "u1", "d1", "t", "c")
		assert.Error(t, err)
	})

	t.Run("delete_chunks_error", func(t *testing.T) {
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return nil, errors.New("not found")
			},
			deleteChunksByDocIDFn: func(context.Context, string) error {
				return errors.New("delete fail")
			},
		}
		mgr := &mockAIManager{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return []float32{0.1}, nil
			},
			maxInputCharFn: func() int { return 0 },
		}
		chunker := &mockAIChunker{
			chunkFn: func(context.Context, string) ([]*model.ChunkEmbedding, error) {
				return []*model.ChunkEmbedding{{Content: "c1", Position: 0}}, nil
			},
		}
		svc := newTestAIService(mgr, emb, chunker)
		err := svc.SyncEmbedding(context.Background(), "u1", "d1", "t", "c")
		assert.Error(t, err)
	})

	t.Run("save_chunks_error", func(t *testing.T) {
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return nil, errors.New("not found")
			},
			deleteChunksByDocIDFn: func(context.Context, string) error { return nil },
			saveChunksFn: func(context.Context, []*model.ChunkEmbedding) error {
				return errors.New("save chunks fail")
			},
		}
		mgr := &mockAIManager{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return []float32{0.1}, nil
			},
			maxInputCharFn: func() int { return 0 },
		}
		chunker := &mockAIChunker{
			chunkFn: func(context.Context, string) ([]*model.ChunkEmbedding, error) {
				return []*model.ChunkEmbedding{{Content: "c1", Position: 0}}, nil
			},
		}
		svc := newTestAIService(mgr, emb, chunker)
		err := svc.SyncEmbedding(context.Background(), "u1", "d1", "t", "c")
		assert.Error(t, err)
	})

	t.Run("save_embedding_error", func(t *testing.T) {
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return nil, errors.New("not found")
			},
			deleteChunksByDocIDFn: func(context.Context, string) error { return nil },
			saveChunksFn:          func(context.Context, []*model.ChunkEmbedding) error { return nil },
			saveFn: func(context.Context, *model.DocumentEmbedding) error {
				return errors.New("save emb fail")
			},
		}
		mgr := &mockAIManager{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return []float32{0.1}, nil
			},
			maxInputCharFn: func() int { return 0 },
		}
		chunker := &mockAIChunker{
			chunkFn: func(context.Context, string) ([]*model.ChunkEmbedding, error) {
				return []*model.ChunkEmbedding{{Content: "c1", Position: 0}}, nil
			},
		}
		svc := newTestAIService(mgr, emb, chunker)
		err := svc.SyncEmbedding(context.Background(), "u1", "d1", "t", "c")
		assert.Error(t, err)
	})
}

func TestAIService_SemanticSearch(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		mgr := &mockAIManager{
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
		svc := newTestAIService(mgr, emb, nil)
		ids, scores, err := svc.SemanticSearch(context.Background(), "u1", "query", 10, "")
		require.NoError(t, err)
		assert.Len(t, ids, 2)
		assert.Len(t, scores, 2)
	})

	t.Run("trimmed_query_used", func(t *testing.T) {
		var receivedQuery string
		mgr := &mockAIManager{
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
		svc := newTestAIService(mgr, emb, nil)
		_, _, err := svc.SemanticSearch(context.Background(), "u1", "  hello  ", 10, "")
		require.NoError(t, err)
		assert.Equal(t, "hello", receivedQuery)
	})

	t.Run("embed_error", func(t *testing.T) {
		mgr := &mockAIManager{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return nil, errors.New("embed fail")
			},
		}
		svc := newTestAIService(mgr, nil, nil)
		_, _, err := svc.SemanticSearch(context.Background(), "u1", "query", 10, "")
		assert.Error(t, err)
	})

	t.Run("search_error", func(t *testing.T) {
		mgr := &mockAIManager{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return []float32{0.1}, nil
			},
		}
		emb := &mockEmbeddingRepo{
			searchChunksFn: func(context.Context, string, []float32, float32, int) ([]repo.ChunkSearchResult, error) {
				return nil, errors.New("search fail")
			},
		}
		svc := newTestAIService(mgr, emb, nil)
		_, _, err := svc.SemanticSearch(context.Background(), "u1", "query", 10, "")
		assert.Error(t, err)
	})

	t.Run("no_results", func(t *testing.T) {
		mgr := &mockAIManager{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return []float32{0.1}, nil
			},
		}
		emb := &mockEmbeddingRepo{
			searchChunksFn: func(context.Context, string, []float32, float32, int) ([]repo.ChunkSearchResult, error) {
				return nil, nil
			},
		}
		svc := newTestAIService(mgr, emb, nil)
		ids, scores, err := svc.SemanticSearch(context.Background(), "u1", "query", 10, "")
		require.NoError(t, err)
		assert.Empty(t, ids)
		assert.Empty(t, scores)
	})

	t.Run("with_exclude", func(t *testing.T) {
		mgr := &mockAIManager{
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
		svc := newTestAIService(mgr, emb, nil)
		ids, _, err := svc.SemanticSearch(context.Background(), "u1", "query", 10, "d1")
		require.NoError(t, err)
		assert.Len(t, ids, 1)
		assert.Equal(t, "d2", ids[0])
	})

	t.Run("topk_limit", func(t *testing.T) {
		mgr := &mockAIManager{
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
		svc := newTestAIService(mgr, emb, nil)
		ids, _, err := svc.SemanticSearch(context.Background(), "u1", "query", 2, "")
		require.NoError(t, err)
		assert.Len(t, ids, 2)
	})
}

func TestAIService_ProcessPendingEmbeddings(t *testing.T) {
	t.Run("nil_service", func(t *testing.T) {
		var svc *AIService
		err := svc.ProcessPendingEmbeddings(context.Background(), 60)
		require.NoError(t, err)
	})

	t.Run("nil_embeddings", func(t *testing.T) {
		svc := &AIService{}
		err := svc.ProcessPendingEmbeddings(context.Background(), 60)
		require.NoError(t, err)
	})

	t.Run("no_stale_docs", func(t *testing.T) {
		emb := &mockEmbeddingRepo{
			listStaleDocumentsFn: func(context.Context, int, int64) ([]model.Document, error) {
				return nil, nil
			},
		}
		svc := newTestAIService(&mockAIManager{}, emb, nil)
		err := svc.ProcessPendingEmbeddings(context.Background(), 60)
		require.NoError(t, err)
	})

	t.Run("list_error", func(t *testing.T) {
		emb := &mockEmbeddingRepo{
			listStaleDocumentsFn: func(context.Context, int, int64) ([]model.Document, error) {
				return nil, errors.New("db error")
			},
		}
		svc := newTestAIService(&mockAIManager{}, emb, nil)
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
		svc := newTestAIService(&mockAIManager{}, emb, nil)
		err := svc.ProcessPendingEmbeddings(ctx, 60)
		assert.Error(t, err)
	})
}

func TestAIService_ProcessOneEmbedding(t *testing.T) {
	t.Run("success_marks_succeeded", func(t *testing.T) {
		saved := false
		emb := &mockEmbeddingRepo{
			getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
				return nil, appErr.ErrNotFound
			},
			deleteChunksByDocIDFn: func(context.Context, string) error { return nil },
			saveChunksFn:          func(context.Context, []*model.ChunkEmbedding) error { return nil },
			saveFn: func(_ context.Context, e *model.DocumentEmbedding) error {
				saved = true
				assert.NotEmpty(t, e.ContentHash)
				return nil
			},
		}
		mgr := &mockAIManager{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return []float32{0.1}, nil
			},
			maxInputCharFn: func() int { return 0 },
		}
		chunker := &mockAIChunker{
			chunkFn: func(context.Context, string) ([]*model.ChunkEmbedding, error) {
				return []*model.ChunkEmbedding{{Content: "c1", Position: 0}}, nil
			},
		}
		svc := newTestAIService(mgr, emb, chunker)
		doc := model.Document{ID: "d1", UserID: "u1", Title: "T", Content: "C"}
		processed, err := svc.processOneEmbedding(context.Background(), doc)
		require.NoError(t, err)
		assert.True(t, processed)
		assert.True(t, saved)
	})

	t.Run("rate_limit_does_not_consume_attempt", func(t *testing.T) {
		failedCalled := false
		mgr := &mockAIManager{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return nil, errors.New("rate limit exceeded")
			},
			maxInputCharFn: func() int { return 0 },
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
		chunker := &mockAIChunker{
			chunkFn: func(context.Context, string) ([]*model.ChunkEmbedding, error) {
				return []*model.ChunkEmbedding{{Content: "c1", Position: 0}}, nil
			},
		}
		svc := newTestAIService(mgr, emb, chunker)
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
		mgr := &mockAIManager{
			embedFn: func(context.Context, string, string) ([]float32, error) {
				return nil, errors.New("internal error")
			},
			maxInputCharFn: func() int { return 0 },
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
		chunker := &mockAIChunker{
			chunkFn: func(context.Context, string) ([]*model.ChunkEmbedding, error) {
				return []*model.ChunkEmbedding{{Content: "c1", Position: 0}}, nil
			},
		}
		svc := newTestAIService(mgr, emb, chunker)
		doc := model.Document{ID: "d1", UserID: "u1", Title: "T", Content: "C"}
		processed, err := svc.processOneEmbedding(context.Background(), doc)
		require.NoError(t, err)
		assert.True(t, processed)
		assert.Greater(t, retryAt, int64(0))
		assert.Contains(t, errMsg, "internal error")
	})
}

// TestAIService_MarkEmbeddingPending exercises the BE-2 wrapper used by the
// save transaction. It covers (a) the nil-service no-op, (b) the empty
// embeddings no-op, (c) the success path, and (d) error wrapping.
func TestAIService_MarkEmbeddingPending(t *testing.T) {
	t.Run("nil_service", func(t *testing.T) {
		var svc *AIService
		require.NoError(t, svc.MarkEmbeddingPending(context.Background(), "u", "d", "h", 1))
	})
	t.Run("nil_embeddings", func(t *testing.T) {
		svc := &AIService{}
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
		svc := newTestAIService(&mockAIManager{}, emb, nil)
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
		svc := newTestAIService(&mockAIManager{}, emb, nil)
		err := svc.MarkEmbeddingPending(context.Background(), "u", "d", "h", 1)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "upsert pending")
	})
}

// TestAIService_ClaimEmbedding exercises the BE-2 claim/lease branches that
// were missed by the higher-level processOneEmbedding tests: a seed insert
// when no row exists yet, a hard failure from GetByDocID, a failure from
// the initial seed write, and a Claim that loses the race (returns false).
func TestAIService_ClaimEmbedding(t *testing.T) {
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
		svc := newTestAIService(&mockAIManager{}, emb, nil)
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
		svc := newTestAIService(&mockAIManager{}, emb, nil)
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
		svc := newTestAIService(&mockAIManager{}, emb, nil)
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
		svc := newTestAIService(&mockAIManager{}, emb, nil)
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
		svc := newTestAIService(&mockAIManager{}, emb, nil)
		ok, err := svc.claimEmbedding(context.Background(), model.Document{ID: "d1"}, 0)
		require.NoError(t, err)
		assert.False(t, ok)
	})
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

// TestAIService_ProcessOneEmbedding_ClaimLost covers the early return from
// processOneEmbedding when claimEmbedding reports the document is owned by
// another worker (no sync, no failure recorded).
func TestAIService_ProcessOneEmbedding_ClaimLost(t *testing.T) {
	syncCalled := false
	emb := &mockEmbeddingRepo{
		getByDocIDFn: func(context.Context, string) (*model.DocumentEmbedding, error) {
			return &model.DocumentEmbedding{DocumentID: "d1"}, nil
		},
		claimFn: func(context.Context, string, int64, int64) (bool, error) { return false, nil },
	}
	mgr := &mockAIManager{
		embedFn: func(context.Context, string, string) ([]float32, error) {
			syncCalled = true
			return []float32{0}, nil
		},
		maxInputCharFn: func() int { return 0 },
	}
	svc := newTestAIService(mgr, emb, &mockAIChunker{})
	doc := model.Document{ID: "d1", UserID: "u1", Title: "t", Content: "c"}
	processed, err := svc.processOneEmbedding(context.Background(), doc)
	require.NoError(t, err)
	assert.False(t, processed)
	assert.False(t, syncCalled, "sync must not run when the claim is lost")
}

func TestNewAIService(t *testing.T) {
	svc := newAIServiceFromInterfaces(
		&mockAIManager{maxInputCharFn: func() int { return 0 }},
		&mockEmbeddingRepo{},
		&mockAIChunker{},
	)
	assert.NotNil(t, svc)
	assert.NotNil(t, svc.cache)
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
	mgr := &mockAIManager{
		embedFn: func(context.Context, string, string) ([]float32, error) {
			return []float32{0.1}, nil
		},
		maxInputCharFn: func() int { return 0 },
	}
	chunker := &mockAIChunker{
		chunkFn: func(context.Context, string) ([]*model.ChunkEmbedding, error) {
			return []*model.ChunkEmbedding{{Content: "c1", Position: 0}}, nil
		},
	}
	svc := newTestAIService(mgr, emb, chunker)

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
	svc := newTestAIService(&mockAIManager{maxInputCharFn: func() int { return 0 }}, emb, &mockAIChunker{})
	err := svc.ProcessPendingEmbeddings(context.Background(), 0)
	assert.Error(t, err)
}

func TestProcessPendingEmbeddings_EmptyList(t *testing.T) {
	emb := &mockEmbeddingRepo{
		listStaleDocumentsFn: func(context.Context, int, int64) ([]model.Document, error) {
			return nil, nil
		},
	}
	svc := newTestAIService(&mockAIManager{maxInputCharFn: func() int { return 0 }}, emb, &mockAIChunker{})
	err := svc.ProcessPendingEmbeddings(context.Background(), 0)
	assert.NoError(t, err)
}
