package repo

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
)

func newEmbeddingV2SQLMock(
	t *testing.T,
) (*sql.DB, sqlmock.Sqlmock) {
	t.Helper()
	database, mock, err := sqlmock.New()
	require.NoError(t, err)
	t.Cleanup(func() {
		require.NoError(t, mock.ExpectationsWereMet())
		_ = database.Close()
	})
	return database, mock
}

func testEmbeddingV2Profile() model.EmbeddingProfile {
	return model.EmbeddingProfile{
		ID:               "profile-1",
		Fingerprint:      strings.Repeat("a", 64),
		SpaceID:          "space-1",
		Model:            "model-1",
		Dimensions:       384,
		Metric:           "cosine",
		QueryTaskType:    "RETRIEVAL_QUERY",
		DocumentTaskType: "RETRIEVAL_DOCUMENT",
		ChunkerVersion:   2,
		Ctime:            100,
	}
}

func embeddingProfileRow(
	rows *sqlmock.Rows,
	profile model.EmbeddingProfile,
) *sqlmock.Rows {
	return rows.AddRow(
		profile.ID,
		profile.Fingerprint,
		profile.SpaceID,
		profile.Model,
		profile.Dimensions,
		profile.Metric,
		profile.QueryTaskType,
		profile.DocumentTaskType,
		profile.ChunkerVersion,
		profile.Ctime,
	)
}

func TestEmbeddingCacheV2Repo_CRUDAndCleanup(t *testing.T) {
	database, mock := newEmbeddingV2SQLMock(t)
	repository := NewEmbeddingCacheV2Repo(database)
	ctx := context.Background()
	mock.ExpectQuery("SELECT embedding").
		WithArgs("profile-1", "query", "hash-1", int64(10)).
		WillReturnRows(sqlmock.NewRows([]string{"embedding"}).AddRow("[1,2]"))
	vector, found, err := repository.Get(ctx, "profile-1", "query", "hash-1", 10)
	require.NoError(t, err)
	assert.True(t, found)
	assert.Equal(t, []float32{1, 2}, vector)

	mock.ExpectExec("INSERT INTO embedding_cache_v2").
		WillReturnResult(sqlmock.NewResult(0, 1))
	require.NoError(t, repository.Save(ctx, model.EmbeddingCacheV2{
		ProfileID:   "profile-1",
		TaskType:    "query",
		ContentHash: "hash-1",
		Dimensions:  2,
		Embedding:   []float32{1, 2},
		Ctime:       100,
	}))
	mock.ExpectExec("DELETE FROM embedding_cache_v2").
		WillReturnResult(sqlmock.NewResult(0, 1))
	require.NoError(t, repository.Delete(ctx, "profile-1", "query", "hash-1"))
	mock.ExpectExec("WITH expired").
		WithArgs(int64(90), 20).
		WillReturnResult(sqlmock.NewResult(0, 3))
	deleted, err := repository.DeleteBeforeBatch(ctx, 90, 20)
	require.NoError(t, err)
	assert.Equal(t, int64(3), deleted)
}

func TestEmbeddingCacheV2Repo_MissAndErrors(t *testing.T) {
	database, mock := newEmbeddingV2SQLMock(t)
	repository := NewEmbeddingCacheV2Repo(database)
	ctx := context.Background()
	mock.ExpectQuery("SELECT embedding").WillReturnError(sql.ErrNoRows)
	vector, found, err := repository.Get(ctx, "profile", "query", "hash", 0)
	require.NoError(t, err)
	assert.Nil(t, vector)
	assert.False(t, found)
	assert.Equal(t, int64(0), func() int64 {
		deleted, deleteErr := repository.DeleteBeforeBatch(ctx, 1, 0)
		require.NoError(t, deleteErr)
		return deleted
	}())

	mock.ExpectExec("WITH expired").WillReturnError(assert.AnError)
	_, err = repository.DeleteBeforeBatch(ctx, 1, 1)
	assert.ErrorIs(t, err, assert.AnError)
}

func TestEmbeddingCacheV2Repo_Cooldown(t *testing.T) {
	database, mock := newEmbeddingV2SQLMock(t)
	repository := NewEmbeddingCacheV2Repo(database)
	ctx := context.Background()
	mock.ExpectQuery("SELECT profile_id, provider_name").
		WithArgs("profile-1", "provider-1").
		WillReturnRows(sqlmock.NewRows([]string{
			"profile_id", "provider_name", "blocked_until",
			"last_error_code", "mtime",
		}).AddRow("profile-1", "provider-1", int64(120), "rate_limited", int64(100)))
	cooldown, found, err := repository.GetCooldown(ctx, "profile-1", "provider-1")
	require.NoError(t, err)
	require.True(t, found)
	assert.Equal(t, int64(120), cooldown.BlockedUntil)

	mock.ExpectExec("INSERT INTO embedding_provider_cooldowns").
		WithArgs("profile-1", "provider-1", int64(120), sqlmock.AnyArg(), int64(100)).
		WillReturnResult(sqlmock.NewResult(0, 1))
	require.NoError(t, repository.SaveCooldown(ctx, model.EmbeddingProviderCooldown{
		ProfileID:     "profile-1",
		ProviderName:  "provider-1",
		BlockedUntil:  120,
		LastErrorCode: strings.Repeat("x", 80),
		Mtime:         100,
	}))
	mock.ExpectQuery("SELECT profile_id, provider_name").WillReturnError(sql.ErrNoRows)
	cooldown, found, err = repository.GetCooldown(ctx, "missing", "provider")
	require.NoError(t, err)
	assert.False(t, found)
	assert.Nil(t, cooldown)
}

func TestEmbeddingV2Repo_ProfilesAndGenerations(t *testing.T) {
	database, mock := newEmbeddingV2SQLMock(t)
	repository := NewEmbeddingV2Repo(database)
	ctx := context.Background()
	profile := testEmbeddingV2Profile()
	mock.ExpectExec("INSERT INTO embedding_profiles").
		WillReturnResult(sqlmock.NewResult(0, 1))
	profileRows := sqlmock.NewRows([]string{
		"id", "fingerprint", "space_id", "model", "dimensions", "metric",
		"query_task_type", "document_task_type", "chunker_version", "ctime",
	})
	mock.ExpectQuery("SELECT id, fingerprint").
		WillReturnRows(embeddingProfileRow(profileRows, profile))
	require.NoError(t, repository.EnsureProfile(ctx, profile))

	generationRows := sqlmock.NewRows([]string{
		"id", "profile_id", "status", "reason", "standby_until",
		"ctime", "mtime", "activated_at",
	}).AddRow("generation-1", profile.ID, "building", "initial", 0, 100, 100, 0)
	mock.ExpectQuery("FROM embedding_generations").WillReturnRows(generationRows)
	generation, err := repository.GetGeneration(ctx, "generation-1")
	require.NoError(t, err)
	assert.Equal(t, model.EmbeddingGenerationBuilding, generation.Status)
}

func TestEmbeddingV2Repo_ListsAndWriteQueue(t *testing.T) {
	database, mock := newEmbeddingV2SQLMock(t)
	repository := NewEmbeddingV2Repo(database)
	ctx := context.Background()
	mock.ExpectQuery("FROM embedding_generations").
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "profile_id", "status", "reason", "standby_until",
			"ctime", "mtime", "activated_at",
		}).AddRow("generation-1", "profile-1", "active", "initial", 0, 1, 2, 2))
	generations, err := repository.ListGenerations(ctx)
	require.NoError(t, err)
	require.Len(t, generations, 1)

	mock.ExpectQuery("FROM embedding_provider_cooldowns").
		WillReturnRows(sqlmock.NewRows([]string{
			"profile_id", "provider_name", "blocked_until", "last_error_code", "mtime",
		}).AddRow("profile-1", "provider-1", 100, "rate_limited", 90))
	cooldowns, err := repository.ListCooldowns(ctx, "profile-1")
	require.NoError(t, err)
	require.Len(t, cooldowns, 1)

	mock.ExpectExec("INSERT INTO embedding_jobs").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec("UPDATE document_embedding_indexes").
		WillReturnResult(sqlmock.NewResult(0, 1))
	require.NoError(t, repository.EnqueueContentChange(
		ctx, "user-1", "document-1", "hash-1", 2, 100, 5,
	))
}

func TestEmbeddingV2Repo_ClaimRenewRetryAndDelete(t *testing.T) {
	database, mock := newEmbeddingV2SQLMock(t)
	repository := NewEmbeddingV2Repo(database)
	ctx := context.Background()
	claimRows := sqlmock.NewRows([]string{
		"generation_id", "document_id", "user_id", "desired_content_hash",
		"desired_revision", "status", "available_at", "attempts", "claim_token",
		"lease_until", "last_error_code", "last_error_message", "ctime", "mtime",
		"generation_status", "profile_id", "fingerprint", "space_id", "model",
		"dimensions", "metric", "query_task_type", "document_task_type",
		"chunker_version", "profile_ctime", "title", "content",
	}).AddRow(
		"generation-1", "document-1", "user-1", "hash-1",
		int64(2), "running", int64(100), 1, "claim-1",
		int64(200), "", "", int64(90), int64(100),
		"active", "profile-1", strings.Repeat("a", 64), "space-1", "model-1",
		384, "cosine", "RETRIEVAL_QUERY", "RETRIEVAL_DOCUMENT",
		2, int64(50), "Title", "Content",
	)
	mock.ExpectQuery("WITH candidates").WillReturnRows(claimRows)
	claims, err := repository.ClaimJobs(
		ctx, model.EmbeddingGenerationActive, 1, 100, 200,
	)
	require.NoError(t, err)
	require.Len(t, claims, 1)
	assert.Equal(t, "claim-1", claims[0].ClaimToken)

	mock.ExpectExec("UPDATE embedding_jobs").
		WillReturnResult(sqlmock.NewResult(0, 1))
	renewed, err := repository.RenewClaim(
		ctx, "generation-1", "document-1", "claim-1", 300, 110,
	)
	require.NoError(t, err)
	assert.True(t, renewed)
	mock.ExpectExec("UPDATE embedding_jobs").
		WillReturnResult(sqlmock.NewResult(0, 2))
	retried, err := repository.RetryJobs(ctx, "generation-1", "", 120)
	require.NoError(t, err)
	assert.Equal(t, int64(2), retried)

	for range 3 {
		mock.ExpectExec("DELETE FROM").
			WillReturnResult(sqlmock.NewResult(0, 1))
	}
	require.NoError(t, repository.DeleteDocumentData(ctx, "user-1", "document-1"))
}

func TestEmbeddingV2Repo_GenerationStats(t *testing.T) {
	database, mock := newEmbeddingV2SQLMock(t)
	repository := NewEmbeddingV2Repo(database)
	profile := testEmbeddingV2Profile()
	mock.ExpectQuery("FROM embedding_generations").
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "profile_id", "status", "reason", "standby_until",
			"ctime", "mtime", "activated_at",
		}).AddRow("generation-1", profile.ID, "building", "initial", 0, 1, 2, 0))
	profileRows := sqlmock.NewRows([]string{
		"id", "fingerprint", "space_id", "model", "dimensions", "metric",
		"query_task_type", "document_task_type", "chunker_version", "ctime",
	})
	mock.ExpectQuery("SELECT id, fingerprint").
		WillReturnRows(embeddingProfileRow(profileRows, profile))
	mock.ExpectQuery("SELECT").
		WillReturnRows(sqlmock.NewRows([]string{
			"normal", "current", "pending", "running", "failed",
			"dead", "succeeded", "missing", "drift", "oldest",
		}).AddRow(2, 2, 0, 0, 0, 0, 2, 0, 0, 0))
	stats, err := repository.GenerationStats(context.Background(), "generation-1", 100)
	require.NoError(t, err)
	assert.True(t, stats.CanActivate)
	assert.Equal(t, int64(2), stats.Current)
}

func TestEmbeddingV2Helpers(t *testing.T) {
	assert.True(t, generationAcceptsEmbeddingWrites(
		model.EmbeddingGenerationActive, 0, 100,
	))
	assert.True(t, generationAcceptsEmbeddingWrites(
		model.EmbeddingGenerationStandby, 101, 100,
	))
	assert.False(t, generationAcceptsEmbeddingWrites(
		model.EmbeddingGenerationRetired, 0, 100,
	))
	assert.True(t, generationReadyForRollback(&model.EmbeddingGenerationStats{
		Generation: model.EmbeddingGeneration{
			Status:       model.EmbeddingGenerationStandby,
			StandbyUntil: 101,
		},
		NormalDocuments: 2,
		Current:         2,
	}, 100))
	assert.False(t, generationReadyForRollback(&model.EmbeddingGenerationStats{
		Generation: model.EmbeddingGeneration{Status: model.EmbeddingGenerationFailed},
	}, 100))
	for _, dimensions := range []int{384, 768, 1024, 1536} {
		cast, err := vectorDimensionCast(dimensions)
		require.NoError(t, err)
		assert.Contains(t, cast, "vector")
	}
	_, err := vectorDimensionCast(42)
	assert.ErrorIs(t, err, errEmbeddingDimensionsUnsupported)
	assert.Contains(t, preciseEmbeddingSearchQuery("vector(384)", 384), "WITH scored")
	assert.Contains(t, hnswEmbeddingSearchQuery("vector(384)", 384), "AS closer")
	assert.Contains(t, similarCentroidSearchQuery("vector(384)", 384), "centroid")
}
