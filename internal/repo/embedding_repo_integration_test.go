package repo

import (
	"context"
	"database/sql"
	"fmt"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/dochash"
	"github.com/xxxsen/mnote/internal/testutil"
)

func createEmbeddingRaceDocument(
	t *testing.T,
	db *sql.DB,
	title, content, contentHash string,
) (*EmbeddingRepo, *model.Document) {
	t.Helper()
	ctx := context.Background()
	now := time.Now().Unix()
	doc := &model.Document{
		ID:           fmt.Sprintf("embedding-race-%d", time.Now().UnixNano()),
		UserID:       "embedding-race-user",
		Title:        title,
		Content:      content,
		State:        DocumentStateNormal,
		Ctime:        now,
		Mtime:        now,
		ContentHash:  contentHash,
		ContentMtime: now,
	}
	require.NoError(t, NewDocumentRepo(db).Create(ctx, doc))
	t.Cleanup(func() {
		_, _ = db.ExecContext(ctx, "DELETE FROM chunk_embeddings WHERE document_id = $1", doc.ID)
		_, _ = db.ExecContext(ctx, "DELETE FROM document_embeddings WHERE document_id = $1", doc.ID)
		_, _ = db.ExecContext(ctx, "DELETE FROM documents WHERE id = $1", doc.ID)
	})
	return NewEmbeddingRepo(db), doc
}

func TestEmbeddingRepoIntegration_StaleCompletionPreservesCurrentState(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	t.Cleanup(cleanup)

	setups := []struct {
		name  string
		setup func(*testing.T, *EmbeddingRepo, *model.Document)
	}{
		{
			name: "pending",
			setup: func(t *testing.T, embeddings *EmbeddingRepo, doc *model.Document) {
				t.Helper()
				require.NoError(t, embeddings.UpsertPending(
					context.Background(), doc.ID, doc.UserID, doc.ContentHash, doc.ContentMtime,
				))
			},
		},
		{
			name: "running",
			setup: func(t *testing.T, embeddings *EmbeddingRepo, doc *model.Document) {
				t.Helper()
				require.NoError(t, embeddings.UpsertPending(
					context.Background(), doc.ID, doc.UserID, doc.ContentHash, doc.ContentMtime,
				))
				claimed, err := embeddings.Claim(context.Background(), doc.ID, 2000, 1000)
				require.NoError(t, err)
				require.True(t, claimed)
			},
		},
		{
			name: "failed",
			setup: func(t *testing.T, embeddings *EmbeddingRepo, doc *model.Document) {
				t.Helper()
				require.NoError(t, embeddings.UpsertPending(
					context.Background(), doc.ID, doc.UserID, doc.ContentHash, doc.ContentMtime,
				))
				require.NoError(t, embeddings.MarkFailed(
					context.Background(), doc.ID, "provider failed", 3000,
				))
			},
		},
		{
			name: "succeeded",
			setup: func(t *testing.T, embeddings *EmbeddingRepo, doc *model.Document) {
				t.Helper()
				require.NoError(t, embeddings.Save(context.Background(), &model.DocumentEmbedding{
					DocumentID: doc.ID, UserID: doc.UserID,
					ContentHash: doc.ContentHash, Mtime: 1500,
				}))
			},
		},
	}

	for _, tc := range setups {
		t.Run(tc.name, func(t *testing.T) {
			currentHash := dochash.Compute("B-title", "B-content")
			embeddings, doc := createEmbeddingRaceDocument(
				t, db, "B-title", "B-content", currentHash,
			)
			tc.setup(t, embeddings, doc)
			before, err := embeddings.GetByDocID(context.Background(), doc.ID)
			require.NoError(t, err)

			applied, err := embeddings.CompleteEmbeddingIfCurrent(
				context.Background(), doc.UserID, doc.ID,
				dochash.Compute("A-title", "A-content"), nil, 4000,
			)
			require.NoError(t, err)
			assert.False(t, applied)

			after, err := embeddings.GetByDocID(context.Background(), doc.ID)
			require.NoError(t, err)
			assert.Equal(t, before, after,
				"stale worker must not reset a current-hash row or its lease/backoff")
		})
	}
}

func TestEmbeddingRepoIntegration_StaleCompletionRependsOldHash(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	t.Cleanup(cleanup)

	ctx := context.Background()
	oldHash := dochash.Compute("A-title", "A-content")
	currentHash := dochash.Compute("B-title", "B-content")
	embeddings, doc := createEmbeddingRaceDocument(
		t, db, "B-title", "B-content", currentHash,
	)
	require.NoError(t, embeddings.UpsertPending(
		ctx, doc.ID, doc.UserID, oldHash, doc.ContentMtime-1,
	))
	claimed, err := embeddings.Claim(ctx, doc.ID, 2000, 1000)
	require.NoError(t, err)
	require.True(t, claimed)

	applied, err := embeddings.CompleteEmbeddingIfCurrent(
		ctx, doc.UserID, doc.ID, oldHash, nil, 4000,
	)
	require.NoError(t, err)
	assert.False(t, applied)

	after, err := embeddings.GetByDocID(ctx, doc.ID)
	require.NoError(t, err)
	assert.Equal(t, currentHash, after.ContentHash)
	assert.Equal(t, model.EmbeddingStatusPending, after.EmbeddingStatus)
	assert.Zero(t, after.LockedUntil)
}

func TestEmbeddingRepoIntegration_ClaimDriftRechecksSnapshot(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	t.Cleanup(cleanup)

	t.Run("claims_current_legacy_drift", func(t *testing.T) {
		embeddings, doc := createEmbeddingRaceDocument(
			t, db, "title", "body", "legacy-bad-hash",
		)
		require.NoError(t, embeddings.Save(context.Background(), &model.DocumentEmbedding{
			DocumentID: doc.ID, UserID: doc.UserID,
			ContentHash: dochash.Compute(doc.Title, doc.Content), Mtime: 1000,
		}))

		claimed, err := embeddings.ClaimDrift(
			context.Background(), doc.ID, doc.ContentHash, 2000, 1000,
		)
		require.NoError(t, err)
		assert.True(t, claimed)
	})

	t.Run("rejects_obsolete_scan_snapshot", func(t *testing.T) {
		currentHash := dochash.Compute("title", "body")
		embeddings, doc := createEmbeddingRaceDocument(
			t, db, "title", "body", currentHash,
		)
		require.NoError(t, embeddings.Save(context.Background(), &model.DocumentEmbedding{
			DocumentID: doc.ID, UserID: doc.UserID,
			ContentHash: currentHash, Mtime: 1000,
		}))

		claimed, err := embeddings.ClaimDrift(
			context.Background(), doc.ID, "obsolete-scan-hash", 2000, 1000,
		)
		require.NoError(t, err)
		assert.False(t, claimed)

		after, err := embeddings.GetByDocID(context.Background(), doc.ID)
		require.NoError(t, err)
		assert.Equal(t, model.EmbeddingStatusSucceeded, after.EmbeddingStatus)
	})
}

func TestEmbeddingRepoIntegration_ExpiredRunningLeaseIsRecoverable(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	t.Cleanup(cleanup)

	ctx := context.Background()
	currentHash := dochash.Compute("title", "body")
	embeddings, doc := createEmbeddingRaceDocument(
		t, db, "title", "body", currentHash,
	)
	require.NoError(t, embeddings.UpsertPending(
		ctx, doc.ID, doc.UserID, currentHash, doc.ContentMtime,
	))
	claimed, err := embeddings.Claim(ctx, doc.ID, 1100, 1000)
	require.NoError(t, err)
	require.True(t, claimed)

	docs, err := embeddings.ListStaleDocuments(ctx, 50, 1050)
	require.NoError(t, err)
	assert.NotContains(t, documentIDs(docs), doc.ID)

	docs, err = embeddings.ListStaleDocuments(ctx, 50, 1200)
	require.NoError(t, err)
	assert.Contains(t, documentIDs(docs), doc.ID)

	claimed, err = embeddings.Claim(ctx, doc.ID, 1500, 1200)
	require.NoError(t, err)
	assert.True(t, claimed)
	after, err := embeddings.GetByDocID(ctx, doc.ID)
	require.NoError(t, err)
	assert.Equal(t, int64(1500), after.LockedUntil)
}

func documentIDs(docs []model.Document) []string {
	ids := make([]string, 0, len(docs))
	for _, doc := range docs {
		ids = append(ids, doc.ID)
	}
	return ids
}
