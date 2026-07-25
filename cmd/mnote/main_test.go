package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/ai"
	"github.com/xxxsen/mnote/internal/config"
	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/schedule"
)

func boolPointer(value bool) *bool {
	return &value
}

func TestResponseCompression_LeavesFileBytesAndLengthUntouched(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(responseCompression())
	router.GET("/api/v1/files/:key/preview", func(c *gin.Context) {
		c.Header("Content-Length", "4")
		c.Data(http.StatusOK, "application/pdf", []byte("%PDF"))
	})
	router.HEAD("/api/v1/files/:key/preview", func(c *gin.Context) {
		c.Header("Content-Length", "4")
		c.Status(http.StatusOK)
	})

	for _, method := range []string{http.MethodGet, http.MethodHead} {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(method, "/api/v1/files/test.pdf/preview", nil)
		request.Header.Set("Accept-Encoding", "gzip")
		router.ServeHTTP(recorder, request)

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Empty(t, recorder.Header().Get("Content-Encoding"))
		assert.Equal(t, "4", recorder.Header().Get("Content-Length"))
		if method == http.MethodGet {
			assert.Equal(t, "%PDF", recorder.Body.String())
		} else {
			assert.Empty(t, recorder.Body.String())
		}
	}
}

func TestInitEmbeddingProviders_DisabledSkipsProviderInitialization(t *testing.T) {
	cfg := &config.Config{
		AI: config.AIConfig{Enabled: boolPointer(false)},
		AIProvider: []config.AIProviderConfig{{
			Name: "unused",
			Type: "not-a-provider",
		}},
	}

	providers, err := initEmbeddingProviders(context.Background(), cfg)
	require.NoError(t, err)
	assert.Empty(t, providers)

	embedder, err := initAIEmbedder(context.Background(), cfg, providers, nil)
	require.NoError(t, err)
	require.NotNil(t, embedder)
	_, err = embedder.Embed(context.Background(), "text", "search")
	assert.ErrorIs(t, err, ai.ErrNotConfigured)
}

func TestInitAIEmbedder_V2OnlyConfigDoesNotRequireLegacyProvider(t *testing.T) {
	cfg := &config.Config{
		AI: config.AIConfig{
			Enabled: boolPointer(true),
			Profiles: []config.AIProfileConfig{{
				ID: "profile-v2",
			}},
		},
	}
	embedder, err := initAIEmbedder(
		context.Background(),
		cfg,
		map[string]ai.IProvider{},
		nil,
	)
	require.NoError(t, err)
	require.NotNil(t, embedder)
	_, err = embedder.Embed(context.Background(), "text", "query")
	assert.ErrorIs(t, err, ai.ErrNotConfigured)
}

func TestLegacyEmbeddingEnabled(t *testing.T) {
	assert.False(t, legacyEmbeddingEnabled(config.AIConfig{
		Profiles: []config.AIProfileConfig{{ID: "profile-v2"}},
	}))
	assert.True(t, legacyEmbeddingEnabled(config.AIConfig{
		Profiles: []config.AIProfileConfig{{ID: "profile-v2"}},
		Provider: "legacy",
		Model:    "legacy-model",
	}))
	assert.True(t, legacyEmbeddingEnabled(config.AIConfig{}))
}

func TestValidateRuntimeConfig_ValidatesFileStore(t *testing.T) {
	t.Run("valid local store", func(t *testing.T) {
		cfg := &config.Config{FileStore: config.FileStoreConfig{
			Type: "local",
			Data: map[string]any{"dir": t.TempDir()},
		}}
		require.NoError(t, validateRuntimeConfig(cfg))
	})

	t.Run("missing local directory", func(t *testing.T) {
		cfg := &config.Config{FileStore: config.FileStoreConfig{
			Type: "local",
			Data: map[string]any{},
		}}
		assert.Error(t, validateRuntimeConfig(cfg))
	})

	t.Run("unknown storage field", func(t *testing.T) {
		cfg := &config.Config{FileStore: config.FileStoreConfig{
			Type: "local",
			Data: map[string]any{"dir": t.TempDir(), "directory": "typo"},
		}}
		err := validateRuntimeConfig(cfg)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "unknown field")
	})
}

func TestInitEmbeddingProviders_OnlyInitializesConfiguredProviders(t *testing.T) {
	cfg := &config.Config{
		AI: config.AIConfig{
			Enabled: boolPointer(true),
			Embed: []config.AIEmbeddingConfig{{
				Provider: "embedding",
				Model:    "model",
			}},
		},
		AIProvider: []config.AIProviderConfig{
			{Name: "embedding", Type: "openai", Data: map[string]any{}},
			{Name: "unused-invalid", Type: "not-a-provider"},
		},
	}

	providers, err := initEmbeddingProviders(context.Background(), cfg)
	require.NoError(t, err)
	assert.Contains(t, providers, "embedding")
	assert.NotContains(t, providers, "unused-invalid")

	embedder, err := initAIEmbedder(context.Background(), cfg, providers, nil)
	require.NoError(t, err)
	assert.NotNil(t, embedder)
}

type configuredProfileEmbedder struct {
	vectors [][]float32
	err     error
	calls   int
}

func (configuredProfileEmbedder) Profile() ai.ProfileIdentity {
	return ai.ProfileIdentity{ID: "configured"}
}

func (embedder *configuredProfileEmbedder) EmbedBatch(
	context.Context,
	ai.EmbeddingRequest,
) (ai.EmbeddingResult, error) {
	embedder.calls++
	return ai.EmbeddingResult{Vectors: embedder.vectors}, embedder.err
}

func TestValidateConfiguredEmbeddingGenerations(t *testing.T) {
	configured := map[string]struct{}{
		"configured": {},
	}
	require.NoError(t, validateConfiguredEmbeddingGenerations(
		[]model.EmbeddingGeneration{
			{ID: "active", ProfileID: "configured", Status: model.EmbeddingGenerationActive},
			{ID: "failed", ProfileID: "removed", Status: model.EmbeddingGenerationFailed},
			{ID: "retired", ProfileID: "removed", Status: model.EmbeddingGenerationRetired},
		},
		configured,
	))

	for _, status := range []model.EmbeddingGenerationStatus{
		model.EmbeddingGenerationActive,
		model.EmbeddingGenerationBuilding,
		model.EmbeddingGenerationStandby,
	} {
		err := validateConfiguredEmbeddingGenerations(
			[]model.EmbeddingGeneration{{
				ID:        "generation",
				ProfileID: "missing",
				Status:    status,
			}},
			configured,
		)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "not in the current config")
	}
}

type fakeEmbeddingProfileReader struct {
	profiles map[string]*model.EmbeddingProfile
	calls    int
}

func (reader *fakeEmbeddingProfileReader) GetProfile(
	_ context.Context,
	id string,
) (*model.EmbeddingProfile, error) {
	reader.calls++
	return reader.profiles[id], nil
}

func TestValidateStoredEmbeddingProfiles(t *testing.T) {
	profile := config.AIProfileConfig{
		ID:               "configured",
		SpaceID:          "space",
		Model:            "model",
		Dimensions:       384,
		Metric:           "cosine",
		QueryTaskType:    "query",
		DocumentTaskType: "document",
		ChunkerVersion:   2,
	}
	generations := []model.EmbeddingGeneration{
		{ID: "active", ProfileID: profile.ID, Status: model.EmbeddingGenerationActive},
		{ID: "standby", ProfileID: profile.ID, Status: model.EmbeddingGenerationStandby},
		{ID: "retired", ProfileID: "removed", Status: model.EmbeddingGenerationRetired},
	}
	reader := &fakeEmbeddingProfileReader{profiles: map[string]*model.EmbeddingProfile{
		profile.ID: {ID: profile.ID, Fingerprint: profile.Fingerprint()},
	}}
	require.NoError(t, validateStoredEmbeddingProfiles(
		context.Background(),
		generations,
		[]config.AIProfileConfig{profile},
		reader,
	))
	assert.Equal(t, 1, reader.calls, "the same live Profile should only be read once")

	reader.profiles[profile.ID].Fingerprint = "drifted"
	err := validateStoredEmbeddingProfiles(
		context.Background(),
		generations,
		[]config.AIProfileConfig{profile},
		reader,
	)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "fingerprint does not match")
}

type fakeEmbeddingGenerationBootstrapRepo struct {
	generation *model.EmbeddingGeneration
	profileID  string
	reason     string
	restart    bool
	now        int64
	calls      int
}

func (repository *fakeEmbeddingGenerationBootstrapRepo) CreateBuildingGeneration(
	_ context.Context,
	profileID, reason string,
	restart bool,
	now int64,
) (*model.EmbeddingGeneration, error) {
	repository.calls++
	repository.profileID = profileID
	repository.reason = reason
	repository.restart = restart
	repository.now = now
	return repository.generation, nil
}

func TestEnsureInitialEmbeddingGeneration(t *testing.T) {
	profiles := []config.AIProfileConfig{{ID: "default-v2"}}

	t.Run("creates the first generation", func(t *testing.T) {
		expected := &model.EmbeddingGeneration{
			ID:        "generation",
			ProfileID: profiles[0].ID,
			Status:    model.EmbeddingGenerationBuilding,
			Reason:    "initial",
		}
		repository := &fakeEmbeddingGenerationBootstrapRepo{
			generation: expected,
		}
		generationID, err := ensureInitialEmbeddingGeneration(
			context.Background(),
			nil,
			profiles,
			repository,
			100,
		)
		require.NoError(t, err)
		assert.Equal(t, expected.ID, generationID)
		assert.Equal(t, 1, repository.calls)
		assert.Equal(t, profiles[0].ID, repository.profileID)
		assert.Equal(t, "initial", repository.reason)
		assert.False(t, repository.restart)
		assert.Equal(t, int64(100), repository.now)
	})

	t.Run("resumes an existing initial generation", func(t *testing.T) {
		existing := model.EmbeddingGeneration{
			ID:        "existing",
			ProfileID: profiles[0].ID,
			Status:    model.EmbeddingGenerationBuilding,
			Reason:    "initial",
		}
		repository := &fakeEmbeddingGenerationBootstrapRepo{
			generation: &existing,
		}
		generationID, err := ensureInitialEmbeddingGeneration(
			context.Background(),
			[]model.EmbeddingGeneration{existing},
			profiles,
			repository,
			100,
		)
		require.NoError(t, err)
		assert.Equal(t, existing.ID, generationID)
		assert.Equal(t, 1, repository.calls)
		assert.Equal(t, existing.ProfileID, repository.profileID)
	})

	t.Run("does not replace an existing generation", func(t *testing.T) {
		repository := &fakeEmbeddingGenerationBootstrapRepo{}
		generationID, err := ensureInitialEmbeddingGeneration(
			context.Background(),
			[]model.EmbeddingGeneration{{
				ID:     "active",
				Status: model.EmbeddingGenerationActive,
			}},
			profiles,
			repository,
			100,
		)
		require.NoError(t, err)
		assert.Empty(t, generationID)
		assert.Zero(t, repository.calls)
	})
}

func TestPreflightEmbeddingProfile(t *testing.T) {
	profile := model.EmbeddingProfile{
		Dimensions:       2,
		QueryTaskType:    "query",
		DocumentTaskType: "document",
	}
	embedder := &configuredProfileEmbedder{
		vectors: [][]float32{{1, 0}},
	}
	require.NoError(t, preflightEmbeddingProfile(
		context.Background(),
		profile,
		embedder,
	))
	assert.Equal(t, 2, embedder.calls)

	embedder = &configuredProfileEmbedder{
		vectors: [][]float32{{1}},
	}
	err := preflightEmbeddingProfile(context.Background(), profile, embedder)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid dimensions")

	expected := context.DeadlineExceeded
	embedder = &configuredProfileEmbedder{err: expected}
	err = preflightEmbeddingProfile(context.Background(), profile, embedder)
	require.Error(t, err)
	assert.ErrorIs(t, err, expected)
}

type recordingScheduler struct {
	names []string
}

func (s *recordingScheduler) AddJob(job schedule.Job, _ string) error {
	s.names = append(s.names, job.Name())
	return nil
}

func (*recordingScheduler) Start(context.Context) {}
func (*recordingScheduler) Stop()                 {}

func TestAddScheduledJobs_RespectsEmbeddingSwitch(t *testing.T) {
	t.Run("embedding disabled", func(t *testing.T) {
		scheduler := &recordingScheduler{}
		cfg := &config.Config{AI: config.AIConfig{Enabled: boolPointer(false)}}

		require.NoError(t, addScheduledJobs(scheduler, cfg, nil, serverRepos{}))
		assert.Equal(t, []string{"import_cleanup"}, scheduler.names)
	})

	t.Run("embedding enabled", func(t *testing.T) {
		scheduler := &recordingScheduler{}
		cfg := &config.Config{
			AI: config.AIConfig{
				Enabled:  boolPointer(true),
				Provider: "legacy-provider",
				Model:    "legacy-model",
			},
			AIJob: config.AIJobConfig{EmbeddingDelaySeconds: 30},
		}

		require.NoError(t, addScheduledJobs(scheduler, cfg, nil, serverRepos{}))
		assert.ElementsMatch(
			t,
			[]string{"import_cleanup", "ai_embedding", "embedding_cache_cleanup"},
			scheduler.names,
		)
	})

	t.Run("v2 only", func(t *testing.T) {
		scheduler := &recordingScheduler{}
		cfg := &config.Config{
			AI: config.AIConfig{
				Enabled: boolPointer(true),
				Profiles: []config.AIProfileConfig{{
					ID: "profile-v2",
				}},
			},
		}

		require.NoError(t, addScheduledJobs(scheduler, cfg, nil, serverRepos{}))
		assert.Equal(
			t,
			[]string{"import_cleanup", "embedding_v2_maintenance"},
			scheduler.names,
		)
	})
}
