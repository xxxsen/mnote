//go:build integration

package repo

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/pgvector/pgvector-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/dochash"
	"github.com/xxxsen/mnote/internal/testutil"
)

func createEmbeddingV2Document(
	t *testing.T,
	db *sql.DB,
	id, userID, title, content string,
) model.Document {
	t.Helper()
	now := time.Now().Unix()
	document := model.Document{
		ID:              id,
		UserID:          userID,
		Title:           title,
		Content:         content,
		ContentHash:     dochash.Compute(title, content),
		ContentRevision: 1,
		ContentMtime:    now,
		State:           DocumentStateNormal,
		Ctime:           now,
		Mtime:           now,
	}
	require.NoError(t, NewDocumentRepo(db).Create(context.Background(), &document))
	return document
}

func embeddingV2Profile(now int64) model.EmbeddingProfile {
	return model.EmbeddingProfile{
		ID:               "test-profile",
		Fingerprint:      strings.Repeat("a", 64),
		SpaceID:          "test-space",
		Model:            "test-model",
		Dimensions:       384,
		Metric:           "cosine",
		QueryTaskType:    "RETRIEVAL_QUERY",
		DocumentTaskType: "RETRIEVAL_DOCUMENT",
		ChunkerVersion:   2,
		Ctime:            now,
	}
}

func embeddingV2ProfileFor(
	id string,
	fingerprintCharacter string,
	dimensions int,
	now int64,
) model.EmbeddingProfile {
	profile := embeddingV2Profile(now)
	profile.ID = id
	profile.Fingerprint = strings.Repeat(fingerprintCharacter, 64)
	profile.SpaceID = id + "-space"
	profile.Model = id + "-model"
	profile.Dimensions = dimensions
	return profile
}

func unitVector(dimensions, index int) []float32 {
	vector := make([]float32, dimensions)
	vector[index] = 1
	return vector
}

func completeEmbeddingV2Claims(
	t *testing.T,
	repository *EmbeddingV2Repo,
	status model.EmbeddingGenerationStatus,
	now int64,
) []model.EmbeddingJobClaim {
	t.Helper()
	claims, err := repository.ClaimJobs(
		context.Background(),
		status,
		100,
		now,
		now+120,
	)
	require.NoError(t, err)
	for index, claim := range claims {
		vector := unitVector(
			claim.Profile.Dimensions,
			index%claim.Profile.Dimensions,
		)
		applied, err := repository.CompleteClaim(
			context.Background(),
			claim,
			[]model.ChunkEmbeddingV2{{
				Position:   0,
				ChunkType:  model.ChunkTypeTitle,
				Content:    claim.Title,
				TokenCount: len(claim.Title),
				Embedding:  vector,
			}},
			vector,
			now+1,
		)
		require.NoError(t, err)
		require.True(t, applied)
	}
	return claims
}

func TestEmbeddingV2RepoIntegration_FencedCompletionAndActiveSearch(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	t.Cleanup(cleanup)
	ctx := context.Background()
	now := time.Now().Unix()
	documents := []model.Document{
		createEmbeddingV2Document(
			t,
			db,
			fmt.Sprintf("embedding-v2-a-%d", time.Now().UnixNano()),
			"embedding-v2-user",
			"Alpha",
			"first document",
		),
		createEmbeddingV2Document(
			t,
			db,
			fmt.Sprintf("embedding-v2-b-%d", time.Now().UnixNano()),
			"embedding-v2-user",
			"Beta",
			"second document",
		),
	}
	embeddings := NewEmbeddingV2Repo(db)
	profile := embeddingV2Profile(now)
	require.NoError(t, embeddings.EnsureProfile(ctx, profile))
	require.NoError(t, embeddings.EnsureProfile(ctx, profile))
	generation, err := embeddings.CreateBuildingGeneration(
		ctx,
		profile.ID,
		"initial",
		false,
		now,
	)
	require.NoError(t, err)

	claims, err := embeddings.ClaimJobs(
		ctx,
		model.EmbeddingGenerationBuilding,
		10,
		now,
		now+120,
	)
	require.NoError(t, err)
	require.Len(t, claims, 2)

	secondClaim, err := embeddings.ClaimJobs(
		ctx,
		model.EmbeddingGenerationBuilding,
		10,
		now+1,
		now+121,
	)
	require.NoError(t, err)
	assert.Empty(t, secondClaim, "unexpired claims must not be issued twice")

	for index, claim := range claims {
		vector := unitVector(profile.Dimensions, index)
		applied, err := embeddings.CompleteClaim(
			ctx,
			claim,
			[]model.ChunkEmbeddingV2{{
				Position:   0,
				ChunkType:  model.ChunkTypeTitle,
				Content:    claim.Title,
				TokenCount: len(claim.Title),
				Embedding:  vector,
			}},
			vector,
			now+2,
		)
		require.NoError(t, err)
		require.True(t, applied)
	}
	stats, err := embeddings.GenerationStats(ctx, generation.ID, now+2)
	require.NoError(t, err)
	assert.True(t, stats.CanActivate)
	assert.Equal(t, int64(2), stats.Current)
	require.NoError(t, embeddings.ActivateGeneration(ctx, generation.ID, now+3, 24*60*60))

	_, activeProfile, searchResults, _, err := embeddings.SearchActiveChunks(
		ctx,
		documents[0].UserID,
		"",
		unitVector(profile.Dimensions, 0),
		200,
	)
	require.NoError(t, err)
	require.Equal(t, profile.ID, activeProfile.ID)
	require.NotEmpty(t, searchResults)
	assert.Equal(t, documents[0].ID, searchResults[0].DocumentID)
	assert.InDelta(t, 1, searchResults[0].Score, 0.0001)

	_, similar, indexed, err := embeddings.SimilarDocuments(
		ctx,
		documents[0].UserID,
		documents[0].ID,
		5,
	)
	require.NoError(t, err)
	assert.True(t, indexed)
	require.Len(t, similar, 1)
	assert.Equal(t, documents[1].ID, similar[0].DocumentID)

	firstDocument := documents[0]
	firstDocument.Title = "Alpha changed"
	firstDocument.ContentHash = dochash.Compute(firstDocument.Title, firstDocument.Content)
	firstDocument.ContentRevision++
	firstDocument.Mtime = now + 4
	firstDocument.ContentMtime = now + 4
	require.NoError(t, NewDocumentRepo(db).Update(ctx, &firstDocument))
	require.NoError(t, embeddings.EnqueueContentChange(
		ctx,
		firstDocument.UserID,
		firstDocument.ID,
		firstDocument.ContentHash,
		firstDocument.ContentRevision,
		now+4,
		0,
	))
	currentClaim, err := embeddings.ClaimJobs(
		ctx,
		model.EmbeddingGenerationActive,
		1,
		now+4,
		now+124,
	)
	require.NoError(t, err)
	require.Len(t, currentClaim, 1)

	replacementClaim, err := embeddings.ClaimJobs(
		ctx,
		model.EmbeddingGenerationActive,
		1,
		now+125,
		now+245,
	)
	require.NoError(t, err)
	require.Len(t, replacementClaim, 1)
	require.NotEqual(t, currentClaim[0].ClaimToken, replacementClaim[0].ClaimToken)

	renewed, err := embeddings.RenewClaim(
		ctx,
		currentClaim[0].GenerationID,
		currentClaim[0].DocumentID,
		currentClaim[0].ClaimToken,
		now+300,
		now+126,
	)
	require.NoError(t, err)
	assert.False(t, renewed, "expired worker token must not renew")
	failed, err := embeddings.MarkClaimFailed(
		ctx,
		currentClaim[0].GenerationID,
		currentClaim[0].DocumentID,
		currentClaim[0].ClaimToken,
		"transport",
		"sanitized",
		now+300,
		now+126,
		10,
		false,
	)
	require.NoError(t, err)
	assert.False(t, failed, "expired worker token must not overwrite failure state")

	applied, err := embeddings.CompleteClaim(
		ctx,
		currentClaim[0],
		nil,
		nil,
		now+126,
	)
	require.NoError(t, err)
	assert.False(t, applied, "expired worker token must be fenced")

	freshVector := unitVector(profile.Dimensions, 2)
	applied, err = embeddings.CompleteClaim(
		ctx,
		replacementClaim[0],
		[]model.ChunkEmbeddingV2{{
			Position:   0,
			ChunkType:  model.ChunkTypeTitle,
			Content:    firstDocument.Title,
			TokenCount: len(firstDocument.Title),
			Embedding:  freshVector,
		}},
		freshVector,
		now+126,
	)
	require.NoError(t, err)
	assert.True(t, applied)

	require.NoError(t, embeddings.DeleteDocumentData(
		ctx,
		documents[1].UserID,
		documents[1].ID,
	))
	for _, check := range []struct {
		name  string
		query string
	}{
		{name: "embedding_jobs", query: "SELECT COUNT(*) FROM embedding_jobs WHERE document_id = $1"},
		{name: "document_embedding_indexes", query: "SELECT COUNT(*) FROM document_embedding_indexes WHERE document_id = $1"},
		{name: "chunk_embeddings_v2", query: "SELECT COUNT(*) FROM chunk_embeddings_v2 WHERE document_id = $1"},
	} {
		var remaining int
		require.NoError(t, db.QueryRowContext(
			ctx,
			check.query,
			documents[1].ID,
		).Scan(&remaining))
		assert.Zero(t, remaining, check.name)
	}
}

func TestEmbeddingV2RepoIntegration_ProfileIsImmutable(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	t.Cleanup(cleanup)
	ctx := context.Background()
	profile := embeddingV2Profile(time.Now().Unix())
	embeddings := NewEmbeddingV2Repo(db)
	require.NoError(t, embeddings.EnsureProfile(ctx, profile))

	changed := profile
	changed.Fingerprint = strings.Repeat("b", 64)
	err := embeddings.EnsureProfile(ctx, changed)
	require.ErrorIs(t, err, errEmbeddingProfileChanged)
}

func TestEmbeddingV2RepoIntegration_RestartFencesRunningGeneration(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	t.Cleanup(cleanup)
	ctx := context.Background()
	now := time.Now().Unix()
	document := createEmbeddingV2Document(
		t,
		db,
		fmt.Sprintf("embedding-restart-%d", time.Now().UnixNano()),
		"embedding-restart-user",
		"Restart",
		"body",
	)
	embeddings := NewEmbeddingV2Repo(db)
	profile := embeddingV2ProfileFor("restart-profile", "c", 384, now)
	require.NoError(t, embeddings.EnsureProfile(ctx, profile))
	oldGeneration, err := embeddings.CreateBuildingGeneration(
		ctx,
		profile.ID,
		"initial",
		false,
		now,
	)
	require.NoError(t, err)
	claims, err := embeddings.ClaimJobs(
		ctx,
		model.EmbeddingGenerationBuilding,
		1,
		now,
		now+120,
	)
	require.NoError(t, err)
	require.Len(t, claims, 1)

	replacement, err := embeddings.CreateBuildingGeneration(
		ctx,
		profile.ID,
		"manual_repair",
		true,
		now+1,
	)
	require.NoError(t, err)
	assert.NotEqual(t, oldGeneration.ID, replacement.ID)
	oldGeneration, err = embeddings.GetGeneration(ctx, oldGeneration.ID)
	require.NoError(t, err)
	assert.Equal(t, model.EmbeddingGenerationFailed, oldGeneration.Status)

	renewed, err := embeddings.RenewClaim(
		ctx,
		claims[0].GenerationID,
		claims[0].DocumentID,
		claims[0].ClaimToken,
		now+200,
		now+2,
	)
	require.NoError(t, err)
	assert.False(t, renewed)
	applied, err := embeddings.CompleteClaim(
		ctx,
		claims[0],
		[]model.ChunkEmbeddingV2{{
			Position:   0,
			ChunkType:  model.ChunkTypeTitle,
			Content:    document.Title,
			TokenCount: len(document.Title),
			Embedding:  unitVector(profile.Dimensions, 0),
		}},
		unitVector(profile.Dimensions, 0),
		now+2,
	)
	require.NoError(t, err)
	assert.False(t, applied)
	var status, token string
	require.NoError(t, db.QueryRowContext(
		ctx,
		`SELECT status, COALESCE(claim_token::text, '')
		 FROM embedding_jobs
		 WHERE generation_id = $1::uuid AND document_id = $2`,
		oldGeneration.ID,
		document.ID,
	).Scan(&status, &token))
	assert.Equal(t, string(model.EmbeddingJobDead), status)
	assert.Empty(t, token)

	var cleaned int64
	for {
		deleted, cleanupErr := embeddings.CleanupRetiredGenerationBatch(
			ctx,
			now+8*24*60*60,
			100,
		)
		require.NoError(t, cleanupErr)
		if deleted == 0 {
			break
		}
		cleaned += deleted
	}
	assert.Positive(t, cleaned)
	_, err = embeddings.GetGeneration(ctx, oldGeneration.ID)
	assert.ErrorIs(t, err, sql.ErrNoRows)
	currentBuilding, err := embeddings.GetGeneration(ctx, replacement.ID)
	require.NoError(t, err)
	assert.Equal(t, model.EmbeddingGenerationBuilding, currentBuilding.Status)
}

func TestEmbeddingV2RepoIntegration_DimensionSwitchAndRollback(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	t.Cleanup(cleanup)
	ctx := context.Background()
	now := time.Now().Unix()
	documents := []model.Document{
		createEmbeddingV2Document(
			t,
			db,
			fmt.Sprintf("embedding-switch-a-%d", time.Now().UnixNano()),
			"embedding-switch-user",
			"First",
			"first body",
		),
		createEmbeddingV2Document(
			t,
			db,
			fmt.Sprintf("embedding-switch-b-%d", time.Now().UnixNano()),
			"embedding-switch-user",
			"Second",
			"second body",
		),
	}
	embeddings := NewEmbeddingV2Repo(db)
	profile1536 := embeddingV2ProfileFor("profile-1536", "a", 1536, now)
	require.NoError(t, embeddings.EnsureProfile(ctx, profile1536))
	generation1536, err := embeddings.CreateBuildingGeneration(
		ctx,
		profile1536.ID,
		"initial",
		false,
		now,
	)
	require.NoError(t, err)
	require.Len(
		t,
		completeEmbeddingV2Claims(
			t,
			embeddings,
			model.EmbeddingGenerationBuilding,
			now,
		),
		len(documents),
	)
	require.NoError(
		t,
		embeddings.ActivateGeneration(ctx, generation1536.ID, now+2, 3600),
	)

	profile768 := embeddingV2ProfileFor("profile-768", "b", 768, now+3)
	require.NoError(t, embeddings.EnsureProfile(ctx, profile768))
	generation768, err := embeddings.CreateBuildingGeneration(
		ctx,
		profile768.ID,
		"model_change",
		false,
		now+3,
	)
	require.NoError(t, err)
	err = embeddings.ActivateGeneration(ctx, generation768.ID, now+4, 3600)
	require.ErrorIs(t, err, errEmbeddingGenerationNotReady)

	_, activeProfile, _, _, err := embeddings.SearchActiveChunks(
		ctx,
		documents[0].UserID,
		"",
		unitVector(profile1536.Dimensions, 0),
		200,
	)
	require.NoError(t, err)
	assert.Equal(t, profile1536.ID, activeProfile.ID)

	changed := documents[0]
	changed.Content = "first body changed while rebuilding"
	changed.ContentHash = dochash.Compute(changed.Title, changed.Content)
	changed.ContentRevision++
	changed.ContentMtime = now + 5
	changed.Mtime = now + 5
	require.NoError(t, NewDocumentRepo(db).Update(ctx, &changed))
	require.NoError(t, embeddings.EnqueueContentChange(
		ctx,
		changed.UserID,
		changed.ID,
		changed.ContentHash,
		changed.ContentRevision,
		now+5,
		0,
	))
	require.Len(
		t,
		completeEmbeddingV2Claims(
			t,
			embeddings,
			model.EmbeddingGenerationActive,
			now+5,
		),
		1,
	)
	require.Len(
		t,
		completeEmbeddingV2Claims(
			t,
			embeddings,
			model.EmbeddingGenerationBuilding,
			now+5,
		),
		len(documents),
	)
	require.NoError(
		t,
		embeddings.ActivateGeneration(ctx, generation768.ID, now+7, 3600),
	)
	activeGeneration, activeProfile, err := embeddings.GetActiveGeneration(ctx)
	require.NoError(t, err)
	assert.Equal(t, generation768.ID, activeGeneration.ID)
	assert.Equal(t, profile768.ID, activeProfile.ID)

	secondChanged := documents[1]
	secondChanged.Content = "second body changed during standby"
	secondChanged.ContentHash = dochash.Compute(
		secondChanged.Title,
		secondChanged.Content,
	)
	secondChanged.ContentRevision++
	secondChanged.ContentMtime = now + 8
	secondChanged.Mtime = now + 8
	require.NoError(t, NewDocumentRepo(db).Update(ctx, &secondChanged))
	require.NoError(t, embeddings.EnqueueContentChange(
		ctx,
		secondChanged.UserID,
		secondChanged.ID,
		secondChanged.ContentHash,
		secondChanged.ContentRevision,
		now+8,
		0,
	))
	require.Len(
		t,
		completeEmbeddingV2Claims(
			t,
			embeddings,
			model.EmbeddingGenerationActive,
			now+8,
		),
		1,
	)
	require.Len(
		t,
		completeEmbeddingV2Claims(
			t,
			embeddings,
			model.EmbeddingGenerationStandby,
			now+8,
		),
		1,
	)

	require.NoError(
		t,
		embeddings.RollbackGeneration(ctx, generation1536.ID, now+10, 3600),
	)
	activeGeneration, activeProfile, err = embeddings.GetActiveGeneration(ctx)
	require.NoError(t, err)
	assert.Equal(t, generation1536.ID, activeGeneration.ID)
	assert.Equal(t, profile1536.ID, activeProfile.ID)
	require.NoError(
		t,
		embeddings.RollbackGeneration(ctx, generation768.ID, now+11, 3600),
	)
	activeGeneration, activeProfile, err = embeddings.GetActiveGeneration(ctx)
	require.NoError(t, err)
	assert.Equal(t, generation768.ID, activeGeneration.ID)
	assert.Equal(t, profile768.ID, activeProfile.ID)

	_, err = db.ExecContext(
		ctx,
		`UPDATE embedding_generations
		 SET standby_until = $2
		 WHERE id = $1::uuid`,
		generation1536.ID,
		now+11,
	)
	require.NoError(t, err)
	err = embeddings.RollbackGeneration(ctx, generation1536.ID, now+12, 3600)
	require.ErrorIs(t, err, errEmbeddingGenerationNotReady)
	_, err = db.ExecContext(
		ctx,
		`UPDATE embedding_jobs
		 SET status = 'pending', available_at = $2,
		     claim_token = NULL, lease_until = 0
		 WHERE generation_id = $1::uuid`,
		generation1536.ID,
		now+12,
	)
	require.NoError(t, err)
	expiredStandbyClaims, err := embeddings.ClaimJobs(
		ctx,
		model.EmbeddingGenerationStandby,
		10,
		now+12,
		now+132,
	)
	require.NoError(t, err)
	assert.Empty(t, expiredStandbyClaims)
	retired, err := embeddings.RetireExpiredStandbys(ctx, now+12)
	require.NoError(t, err)
	assert.Equal(t, int64(1), retired)
	for range 20 {
		deleted, err := embeddings.CleanupRetiredGenerationBatch(
			ctx,
			now+13,
			1,
		)
		require.NoError(t, err)
		assert.LessOrEqual(t, deleted, int64(1))
		var cleanupViolations int
		require.NoError(t, db.QueryRowContext(
			ctx,
			`SELECT
				(SELECT COUNT(*)
				 FROM chunk_embeddings_v2 AS chunk
				 WHERE NOT EXISTS (
					SELECT 1
					FROM document_embedding_indexes AS index
					WHERE index.generation_id = chunk.generation_id
					  AND index.document_id = chunk.document_id
					  AND index.user_id = chunk.user_id
				 ))
				+
				(SELECT COUNT(*)
				 FROM embedding_jobs AS job
				 LEFT JOIN document_embedding_indexes AS index
				   ON index.generation_id = job.generation_id
				  AND index.document_id = job.document_id
				  AND index.user_id = job.user_id
				 WHERE job.status = 'succeeded'
				   AND index.document_id IS NULL)`,
		).Scan(&cleanupViolations))
		assert.Zero(t, cleanupViolations)
		if deleted == 0 {
			break
		}
	}
	_, err = embeddings.GetGeneration(ctx, generation1536.ID)
	require.ErrorIs(t, err, sql.ErrNoRows)
	activeGeneration, _, err = embeddings.GetActiveGeneration(ctx)
	require.NoError(t, err)
	assert.Equal(t, generation768.ID, activeGeneration.ID)
}

func TestEmbeddingV2RepoIntegration_SearchIsolationCurrentHashAndDiversity(
	t *testing.T,
) {
	db, cleanup := testutil.OpenTestDB(t)
	t.Cleanup(cleanup)
	ctx := context.Background()
	now := time.Now().Unix()
	userOne := "embedding-search-user-one"
	userTwo := "embedding-search-user-two"
	longDocument := createEmbeddingV2Document(
		t,
		db,
		fmt.Sprintf("embedding-search-long-%d", time.Now().UnixNano()),
		userOne,
		"Long",
		"long body",
	)
	otherDocument := createEmbeddingV2Document(
		t,
		db,
		fmt.Sprintf("embedding-search-other-%d", time.Now().UnixNano()),
		userOne,
		"Other",
		"other body",
	)
	foreignDocument := createEmbeddingV2Document(
		t,
		db,
		fmt.Sprintf("embedding-search-foreign-%d", time.Now().UnixNano()),
		userTwo,
		"Foreign",
		"foreign body",
	)
	embeddings := NewEmbeddingV2Repo(db)
	profile := embeddingV2ProfileFor("search-profile", "c", 384, now)
	require.NoError(t, embeddings.EnsureProfile(ctx, profile))
	generation, err := embeddings.CreateBuildingGeneration(
		ctx,
		profile.ID,
		"initial",
		false,
		now,
	)
	require.NoError(t, err)
	claims, err := embeddings.ClaimJobs(
		ctx,
		model.EmbeddingGenerationBuilding,
		10,
		now,
		now+120,
	)
	require.NoError(t, err)
	require.Len(t, claims, 3)
	for _, claim := range claims {
		vector := unitVector(profile.Dimensions, 0)
		chunks := []model.ChunkEmbeddingV2{{
			Position:   0,
			ChunkType:  model.ChunkTypeTitle,
			Content:    claim.Title,
			TokenCount: len(claim.Title),
			Embedding:  vector,
		}}
		if claim.DocumentID == longDocument.ID {
			chunks = make([]model.ChunkEmbeddingV2, 250)
			for position := range chunks {
				chunks[position] = model.ChunkEmbeddingV2{
					Position:   position,
					ChunkType:  model.ChunkTypeText,
					Content:    fmt.Sprintf("long chunk %d", position),
					TokenCount: 3,
					Embedding:  vector,
				}
			}
		}
		applied, err := embeddings.CompleteClaim(
			ctx,
			claim,
			chunks,
			vector,
			now+1,
		)
		require.NoError(t, err)
		require.True(t, applied)
	}
	require.NoError(t, embeddings.ActivateGeneration(
		ctx,
		generation.ID,
		now+2,
		3600,
	))

	_, _, results, searchPath, err := embeddings.SearchActiveChunks(
		ctx,
		userOne,
		"",
		unitVector(profile.Dimensions, 0),
		200,
	)
	require.NoError(t, err)
	assert.Equal(t, "precise", searchPath)
	var longMatches int
	var foundOther bool
	for _, result := range results {
		assert.NotEqual(t, foreignDocument.ID, result.DocumentID)
		assert.GreaterOrEqual(t, result.Score, float32(-1))
		assert.LessOrEqual(t, result.Score, float32(1))
		assert.Equal(t, "precise", result.SearchPath)
		if result.DocumentID == longDocument.ID {
			longMatches++
		}
		if result.DocumentID == otherDocument.ID {
			foundOther = true
		}
	}
	assert.Equal(t, 3, longMatches)
	assert.True(t, foundOther, "one long document must not consume all recall slots")

	tx, err := db.BeginTx(ctx, nil)
	require.NoError(t, err)
	t.Cleanup(func() { _ = tx.Rollback() })
	_, err = tx.ExecContext(ctx, "ANALYZE chunk_embeddings_v2")
	require.NoError(t, err)
	_, err = tx.ExecContext(ctx, "SET LOCAL enable_seqscan = off")
	require.NoError(t, err)
	_, err = tx.ExecContext(ctx, "SET LOCAL hnsw.iterative_scan = strict_order")
	require.NoError(t, err)
	planRows, err := tx.QueryContext(
		ctx,
		"EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT) "+
			hnswEmbeddingSearchQuery("vector(384)", 384),
		generation.ID,
		userOne,
		pgvector.NewVector(unitVector(profile.Dimensions, 0)),
		DocumentStateNormal,
		"",
		200,
	)
	require.NoError(t, err)
	var plan strings.Builder
	for planRows.Next() {
		var line string
		require.NoError(t, planRows.Scan(&line))
		plan.WriteString(line)
		plan.WriteByte('\n')
	}
	require.NoError(t, planRows.Err())
	require.NoError(t, planRows.Close())
	require.NoError(t, tx.Rollback())
	assert.Contains(t, plan.String(), "idx_chunk_embeddings_v2_hnsw_384")

	_, _, excluded, _, err := embeddings.SearchActiveChunks(
		ctx,
		userOne,
		longDocument.ID,
		unitVector(profile.Dimensions, 0),
		1,
	)
	require.NoError(t, err)
	require.Len(t, excluded, 1)
	assert.Equal(t, otherDocument.ID, excluded[0].DocumentID)

	for _, status := range []model.EmbeddingJobStatus{
		model.EmbeddingJobPending,
		model.EmbeddingJobFailed,
		model.EmbeddingJobDead,
	} {
		_, err = db.ExecContext(
			ctx,
			`UPDATE embedding_jobs
			 SET status = $3, claim_token = NULL, lease_until = 0
			 WHERE generation_id = $1::uuid AND document_id = $2`,
			generation.ID,
			otherDocument.ID,
			status,
		)
		require.NoError(t, err)
		_, _, filtered, _, searchErr := embeddings.SearchActiveChunks(
			ctx,
			userOne,
			longDocument.ID,
			unitVector(profile.Dimensions, 0),
			200,
		)
		require.NoError(t, searchErr)
		assert.Empty(t, filtered, "%s jobs must not participate in recall", status)
	}
	_, err = db.ExecContext(
		ctx,
		`UPDATE embedding_jobs
		 SET status = 'succeeded', claim_token = NULL, lease_until = 0
		 WHERE generation_id = $1::uuid AND document_id = $2`,
		generation.ID,
		otherDocument.ID,
	)
	require.NoError(t, err)

	_, similar, indexed, err := embeddings.SimilarDocuments(
		ctx,
		userOne,
		longDocument.ID,
		5,
	)
	require.NoError(t, err)
	assert.True(t, indexed)
	require.Len(t, similar, 1)
	assert.Equal(t, otherDocument.ID, similar[0].DocumentID)

	otherDocument.Content = "changed without a committed index"
	otherDocument.ContentHash = dochash.Compute(
		otherDocument.Title,
		otherDocument.Content,
	)
	otherDocument.ContentRevision++
	otherDocument.ContentMtime = now + 3
	otherDocument.Mtime = now + 3
	require.NoError(t, NewDocumentRepo(db).Update(ctx, &otherDocument))
	_, _, staleFiltered, _, err := embeddings.SearchActiveChunks(
		ctx,
		userOne,
		longDocument.ID,
		unitVector(profile.Dimensions, 0),
		200,
	)
	require.NoError(t, err)
	assert.Empty(t, staleFiltered)

	_, _, foreignResults, _, err := embeddings.SearchActiveChunks(
		ctx,
		userTwo,
		"",
		unitVector(profile.Dimensions, 0),
		200,
	)
	require.NoError(t, err)
	require.Len(t, foreignResults, 1)
	assert.Equal(t, foreignDocument.ID, foreignResults[0].DocumentID)

	_, err = db.ExecContext(
		ctx,
		`UPDATE documents SET state = $3, mtime = $4
		 WHERE id = $1 AND user_id = $2`,
		foreignDocument.ID,
		foreignDocument.UserID,
		DocumentStateDeleted,
		now+4,
	)
	require.NoError(t, err)
	_, _, deletedResults, _, err := embeddings.SearchActiveChunks(
		ctx,
		userTwo,
		"",
		unitVector(profile.Dimensions, 0),
		200,
	)
	require.NoError(t, err)
	assert.Empty(t, deletedResults)
}

func TestEmbeddingV2RepoIntegration_LargeSearchSelectsHNSWPath(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	t.Cleanup(cleanup)
	ctx := context.Background()
	now := time.Now().Unix()
	const userID = "embedding-v2-large-search-user"
	first := createEmbeddingV2Document(
		t,
		db,
		"bulk-search-0000",
		userID,
		"Bulk 0",
		"body",
	)
	_, err := db.ExecContext(
		ctx,
		`INSERT INTO documents (
			id, user_id, title, content, state, pinned, starred, ctime, mtime,
			content_hash, content_mtime, content_revision
		)
		SELECT
			'bulk-search-' || lpad(value::text, 4, '0'),
			$1,
			'Bulk ' || value,
			'body',
			$2,
			0,
			0,
			$3,
			$3,
			'bulk-hash-' || value,
			$3,
			1
		FROM generate_series(1, 101) AS value`,
		userID,
		DocumentStateNormal,
		now,
	)
	require.NoError(t, err)

	embeddings := NewEmbeddingV2Repo(db)
	profile := embeddingV2ProfileFor(
		"large-search-profile",
		"e",
		384,
		now,
	)
	require.NoError(t, embeddings.EnsureProfile(ctx, profile))
	generation, err := embeddings.CreateBuildingGeneration(
		ctx,
		profile.ID,
		"initial",
		false,
		now,
	)
	require.NoError(t, err)
	vector := unitVector(profile.Dimensions, 0)
	_, err = db.ExecContext(
		ctx,
		`INSERT INTO document_embedding_indexes (
			generation_id, document_id, user_id, indexed_content_hash,
			indexed_revision, dimensions, chunk_count, centroid, indexed_at
		)
		SELECT
			$1::uuid, document.id, document.user_id, document.content_hash,
			document.content_revision, $2, 200, $3::vector, $4
		FROM documents AS document
		WHERE document.user_id = $5`,
		generation.ID,
		profile.Dimensions,
		pgvector.NewVector(vector),
		now,
		userID,
	)
	require.NoError(t, err)
	_, err = db.ExecContext(
		ctx,
		`INSERT INTO chunk_embeddings_v2 (
			generation_id, document_id, user_id, position, chunk_type,
			content, token_count, dimensions, embedding, ctime
		)
		SELECT
			$1::uuid, document.id, document.user_id, position,
			'text', 'bulk chunk', 10, $2, $3::vector, $4
		FROM documents AS document
		CROSS JOIN generate_series(0, 199) AS position
		WHERE document.user_id = $5`,
		generation.ID,
		profile.Dimensions,
		pgvector.NewVector(vector),
		now,
		userID,
	)
	require.NoError(t, err)
	_, err = db.ExecContext(
		ctx,
		`UPDATE embedding_jobs
		 SET status = 'succeeded', claim_token = NULL, lease_until = 0,
		     desired_content_hash = document.content_hash
		 FROM documents AS document
		 WHERE embedding_jobs.generation_id = $1::uuid
		   AND embedding_jobs.document_id = document.id
		   AND embedding_jobs.user_id = document.user_id
		   AND document.user_id = $2`,
		generation.ID,
		userID,
	)
	require.NoError(t, err)
	require.NoError(t, embeddings.ActivateGeneration(
		ctx,
		generation.ID,
		now+1,
		3600,
	))

	_, _, results, searchPath, err := embeddings.SearchActiveChunks(
		ctx,
		userID,
		first.ID,
		vector,
		10,
	)
	require.NoError(t, err)
	assert.Equal(t, "hnsw", searchPath)
	assert.NotEmpty(t, results)
	for _, result := range results {
		assert.NotEqual(t, first.ID, result.DocumentID)
		assert.Equal(t, "hnsw", result.SearchPath)
	}
}

func TestEmbeddingV2RepoIntegration_DebounceAndConcurrentClaiming(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	t.Cleanup(cleanup)
	ctx := context.Background()
	now := time.Now().Unix()
	const documentCount = 20
	documents := make([]model.Document, 0, documentCount)
	for index := range documentCount {
		documents = append(documents, createEmbeddingV2Document(
			t,
			db,
			fmt.Sprintf(
				"embedding-claim-%d-%d",
				index,
				time.Now().UnixNano(),
			),
			"embedding-claim-user",
			fmt.Sprintf("Document %d", index),
			"body",
		))
	}
	embeddings := NewEmbeddingV2Repo(db)
	profile := embeddingV2ProfileFor("claim-profile", "d", 384, now)
	require.NoError(t, embeddings.EnsureProfile(ctx, profile))
	generation, err := embeddings.CreateBuildingGeneration(
		ctx,
		profile.ID,
		"initial",
		false,
		now,
	)
	require.NoError(t, err)

	const claimers = 4
	start := make(chan struct{})
	claimResults := make(chan []model.EmbeddingJobClaim, claimers)
	claimErrors := make(chan error, claimers)
	var waitGroup sync.WaitGroup
	waitGroup.Add(claimers)
	for range claimers {
		go func() {
			defer waitGroup.Done()
			<-start
			claims, claimErr := embeddings.ClaimJobs(
				ctx,
				model.EmbeddingGenerationBuilding,
				documentCount/claimers,
				now,
				now+120,
			)
			if claimErr != nil {
				claimErrors <- claimErr
				return
			}
			claimResults <- claims
		}()
	}
	close(start)
	waitGroup.Wait()
	close(claimResults)
	close(claimErrors)
	for claimErr := range claimErrors {
		require.NoError(t, claimErr)
	}
	allClaims := make([]model.EmbeddingJobClaim, 0, documentCount)
	seenDocuments := make(map[string]struct{}, documentCount)
	for claims := range claimResults {
		require.Len(t, claims, documentCount/claimers)
		for _, claim := range claims {
			_, duplicated := seenDocuments[claim.DocumentID]
			assert.False(t, duplicated, "SKIP LOCKED returned a duplicate document")
			seenDocuments[claim.DocumentID] = struct{}{}
			allClaims = append(allClaims, claim)
		}
	}
	require.Len(t, allClaims, documentCount)
	for _, claim := range allClaims {
		vector := unitVector(profile.Dimensions, 0)
		applied, completeErr := embeddings.CompleteClaim(
			ctx,
			claim,
			[]model.ChunkEmbeddingV2{{
				Position:   0,
				ChunkType:  model.ChunkTypeTitle,
				Content:    claim.Title,
				TokenCount: len(claim.Title),
				Embedding:  vector,
			}},
			vector,
			now+1,
		)
		require.NoError(t, completeErr)
		require.True(t, applied)
	}
	require.NoError(
		t,
		embeddings.ActivateGeneration(ctx, generation.ID, now+2, 3600),
	)

	changed := documents[0]
	changed.Content = "first delayed content"
	changed.ContentHash = dochash.Compute(changed.Title, changed.Content)
	changed.ContentRevision++
	changed.ContentMtime = now + 10
	changed.Mtime = now + 10
	require.NoError(t, NewDocumentRepo(db).Update(ctx, &changed))
	require.NoError(t, embeddings.EnqueueContentChange(
		ctx,
		changed.UserID,
		changed.ID,
		changed.ContentHash,
		changed.ContentRevision,
		now+10,
		100,
	))
	claims, err := embeddings.ClaimJobs(
		ctx,
		model.EmbeddingGenerationActive,
		1,
		now+109,
		now+229,
	)
	require.NoError(t, err)
	assert.Empty(t, claims)

	changed.Content = "second delayed content"
	changed.ContentHash = dochash.Compute(changed.Title, changed.Content)
	changed.ContentRevision++
	changed.ContentMtime = now + 50
	changed.Mtime = now + 50
	require.NoError(t, NewDocumentRepo(db).Update(ctx, &changed))
	require.NoError(t, embeddings.EnqueueContentChange(
		ctx,
		changed.UserID,
		changed.ID,
		changed.ContentHash,
		changed.ContentRevision,
		now+50,
		100,
	))
	claims, err = embeddings.ClaimJobs(
		ctx,
		model.EmbeddingGenerationActive,
		1,
		now+149,
		now+269,
	)
	require.NoError(t, err)
	assert.Empty(t, claims, "a later save must move the debounce window")
	claims, err = embeddings.ClaimJobs(
		ctx,
		model.EmbeddingGenerationActive,
		1,
		now+150,
		now+270,
	)
	require.NoError(t, err)
	require.Len(t, claims, 1)
	delayedClaim := claims[0]

	changed.ContentRevision++
	changed.ContentMtime = now + 151
	changed.Mtime = now + 151
	require.NoError(t, NewDocumentRepo(db).Update(ctx, &changed))
	require.NoError(t, embeddings.EnqueueContentChange(
		ctx,
		changed.UserID,
		changed.ID,
		changed.ContentHash,
		changed.ContentRevision,
		now+151,
		100,
	))
	var storedStatus, storedToken string
	var storedRevision int64
	require.NoError(t, db.QueryRowContext(
		ctx,
		`SELECT status, claim_token::text, desired_revision
		 FROM embedding_jobs
		 WHERE generation_id = $1::uuid AND document_id = $2`,
		generation.ID,
		changed.ID,
	).Scan(&storedStatus, &storedToken, &storedRevision))
	assert.Equal(t, string(model.EmbeddingJobRunning), storedStatus)
	assert.Equal(t, delayedClaim.ClaimToken, storedToken)
	assert.Equal(t, changed.ContentRevision, storedRevision)
	vector := unitVector(profile.Dimensions, 1)
	applied, err := embeddings.CompleteClaim(
		ctx,
		delayedClaim,
		[]model.ChunkEmbeddingV2{{
			Position:   0,
			ChunkType:  model.ChunkTypeText,
			Content:    changed.Content,
			TokenCount: 3,
			Embedding:  vector,
		}},
		vector,
		now+152,
	)
	require.NoError(t, err)
	assert.True(t, applied)
	var indexedRevision int64
	require.NoError(t, db.QueryRowContext(
		ctx,
		`SELECT indexed_revision
		 FROM document_embedding_indexes
		 WHERE generation_id = $1::uuid AND document_id = $2`,
		generation.ID,
		changed.ID,
	).Scan(&indexedRevision))
	assert.Equal(t, changed.ContentRevision, indexedRevision)

	changed.Content = "claim invalidated by newer content"
	changed.ContentHash = dochash.Compute(changed.Title, changed.Content)
	changed.ContentRevision++
	changed.ContentMtime = now + 200
	changed.Mtime = now + 200
	require.NoError(t, NewDocumentRepo(db).Update(ctx, &changed))
	require.NoError(t, embeddings.EnqueueContentChange(
		ctx,
		changed.UserID,
		changed.ID,
		changed.ContentHash,
		changed.ContentRevision,
		now+200,
		0,
	))
	claims, err = embeddings.ClaimJobs(
		ctx,
		model.EmbeddingGenerationActive,
		1,
		now+200,
		now+320,
	)
	require.NoError(t, err)
	require.Len(t, claims, 1)
	invalidatedClaim := claims[0]

	changed.Content = "newest content"
	changed.ContentHash = dochash.Compute(changed.Title, changed.Content)
	changed.ContentRevision++
	changed.ContentMtime = now + 201
	changed.Mtime = now + 201
	require.NoError(t, NewDocumentRepo(db).Update(ctx, &changed))
	require.NoError(t, embeddings.EnqueueContentChange(
		ctx,
		changed.UserID,
		changed.ID,
		changed.ContentHash,
		changed.ContentRevision,
		now+201,
		0,
	))
	renewed, err := embeddings.RenewClaim(
		ctx,
		invalidatedClaim.GenerationID,
		invalidatedClaim.DocumentID,
		invalidatedClaim.ClaimToken,
		now+400,
		now+202,
	)
	require.NoError(t, err)
	assert.False(t, renewed)
	applied, err = embeddings.CompleteClaim(
		ctx,
		invalidatedClaim,
		nil,
		nil,
		now+202,
	)
	require.NoError(t, err)
	assert.False(t, applied)
	failed, err := embeddings.MarkClaimFailed(
		ctx,
		invalidatedClaim.GenerationID,
		invalidatedClaim.DocumentID,
		invalidatedClaim.ClaimToken,
		"transport",
		"sanitized",
		now+300,
		now+202,
		10,
		false,
	)
	require.NoError(t, err)
	assert.False(t, failed)

	claims, err = embeddings.ClaimJobs(
		ctx,
		model.EmbeddingGenerationActive,
		1,
		now+201,
		now+321,
	)
	require.NoError(t, err)
	require.Len(t, claims, 1)
	deadClaim := claims[0]
	failed, err = embeddings.MarkClaimFailed(
		ctx,
		deadClaim.GenerationID,
		deadClaim.DocumentID,
		deadClaim.ClaimToken,
		"unauthorized",
		"authorization failed",
		now+300,
		now+202,
		10,
		true,
	)
	require.NoError(t, err)
	assert.True(t, failed)
	claims, err = embeddings.ClaimJobs(
		ctx,
		model.EmbeddingGenerationActive,
		1,
		now+1000,
		now+1120,
	)
	require.NoError(t, err)
	assert.Empty(t, claims, "dead jobs must not be auto-claimed")
	retried, err := embeddings.RetryJobs(
		ctx,
		generation.ID,
		changed.ID,
		now+1000,
	)
	require.NoError(t, err)
	assert.Equal(t, int64(1), retried)
	claims, err = embeddings.ClaimJobs(
		ctx,
		model.EmbeddingGenerationActive,
		1,
		now+1000,
		now+1120,
	)
	require.NoError(t, err)
	require.Len(t, claims, 1)
	assert.Equal(t, changed.ID, claims[0].DocumentID)
}

func TestEmbeddingCacheV2RepoIntegration_ProfileIsolationTTLAndCooldown(t *testing.T) {
	db, cleanup := testutil.OpenTestDB(t)
	t.Cleanup(cleanup)
	ctx := context.Background()
	now := time.Now().Unix()
	embeddings := NewEmbeddingV2Repo(db)
	firstProfile := embeddingV2ProfileFor("cache-profile-one", "e", 384, now)
	secondProfile := embeddingV2ProfileFor("cache-profile-two", "f", 384, now)
	require.NoError(t, embeddings.EnsureProfile(ctx, firstProfile))
	require.NoError(t, embeddings.EnsureProfile(ctx, secondProfile))
	cache := NewEmbeddingCacheV2Repo(db)
	contentHash := strings.Repeat("1", 64)
	firstVector := unitVector(384, 0)
	secondVector := unitVector(384, 1)
	require.NoError(t, cache.Save(ctx, model.EmbeddingCacheV2{
		ProfileID:   firstProfile.ID,
		TaskType:    firstProfile.DocumentTaskType,
		ContentHash: contentHash,
		Dimensions:  384,
		Embedding:   firstVector,
		Ctime:       now,
	}))
	require.NoError(t, cache.Save(ctx, model.EmbeddingCacheV2{
		ProfileID:   secondProfile.ID,
		TaskType:    secondProfile.DocumentTaskType,
		ContentHash: contentHash,
		Dimensions:  384,
		Embedding:   secondVector,
		Ctime:       now,
	}))

	cached, found, err := cache.Get(
		ctx,
		firstProfile.ID,
		firstProfile.DocumentTaskType,
		contentHash,
		now,
	)
	require.NoError(t, err)
	assert.True(t, found)
	assert.Equal(t, firstVector, cached)
	cached, found, err = cache.Get(
		ctx,
		secondProfile.ID,
		secondProfile.DocumentTaskType,
		contentHash,
		now,
	)
	require.NoError(t, err)
	assert.True(t, found)
	assert.Equal(t, secondVector, cached)
	_, found, err = cache.Get(
		ctx,
		firstProfile.ID,
		firstProfile.DocumentTaskType,
		contentHash,
		now+1,
	)
	require.NoError(t, err)
	assert.False(t, found, "expired entries must miss at read time")

	deleted, err := cache.DeleteBeforeBatch(ctx, now+1, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(1), deleted)
	deleted, err = cache.DeleteBeforeBatch(ctx, now+1, 1)
	require.NoError(t, err)
	assert.Equal(t, int64(1), deleted)
	deleted, err = cache.DeleteBeforeBatch(ctx, now+1, 1)
	require.NoError(t, err)
	assert.Zero(t, deleted)

	require.NoError(t, cache.SaveCooldown(ctx, model.EmbeddingProviderCooldown{
		ProfileID:     firstProfile.ID,
		ProviderName:  "provider",
		BlockedUntil:  now + 120,
		LastErrorCode: "rate_limited",
		Mtime:         now,
	}))
	require.NoError(t, cache.SaveCooldown(ctx, model.EmbeddingProviderCooldown{
		ProfileID:     firstProfile.ID,
		ProviderName:  "provider",
		BlockedUntil:  now + 60,
		LastErrorCode: "rate_limited",
		Mtime:         now + 1,
	}))
	cooldown, found, err := cache.GetCooldown(
		ctx,
		firstProfile.ID,
		"provider",
	)
	require.NoError(t, err)
	require.True(t, found)
	require.NotNil(t, cooldown)
	assert.Equal(t, now+120, cooldown.BlockedUntil)
}
