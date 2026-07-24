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

func TestInitAIProviders_DisabledSkipsProviderInitialization(t *testing.T) {
	cfg := &config.Config{
		AI: config.AIConfig{Enabled: boolPointer(false)},
		AIProvider: []config.AIProviderConfig{{
			Name: "unused",
			Type: "not-a-provider",
		}},
	}

	providers, err := initAIProviders(cfg)
	require.NoError(t, err)
	assert.Empty(t, providers)

	manager, err := initAIManager(cfg, providers, nil)
	require.NoError(t, err)
	_, err = manager.Generate(context.Background(), "text")
	assert.ErrorIs(t, err, ai.ErrUnavailable)
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

func TestInitAIProviders_OnlyInitializesEnabledFeatureProviders(t *testing.T) {
	cfg := &config.Config{
		AI: config.AIConfig{
			Enabled:         boolPointer(true),
			GenerateEnabled: boolPointer(true),
			SummaryEnabled:  boolPointer(false),
			Generate: []config.AIFeatureConfig{{
				Provider: "generation",
				Model:    "model",
			}},
			Summary: []config.AIFeatureConfig{{
				Provider: "missing-and-disabled",
				Model:    "model",
			}},
		},
		AIProvider: []config.AIProviderConfig{
			{Name: "generation", Type: "openai", Data: map[string]any{}},
			{Name: "unused-invalid", Type: "not-a-provider"},
		},
	}

	providers, err := initAIProviders(cfg)
	require.NoError(t, err)
	assert.Contains(t, providers, "generation")
	assert.NotContains(t, providers, "unused-invalid")

	manager, err := initAIManager(cfg, providers, nil)
	require.NoError(t, err)
	_, err = manager.Summarize(context.Background(), "text")
	assert.ErrorIs(t, err, ai.ErrUnavailable)
	_, err = manager.Embed(context.Background(), "text", "query")
	assert.ErrorIs(t, err, ai.ErrUnavailable)
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

func TestAddScheduledJobs_RespectsAIFeatureSwitches(t *testing.T) {
	t.Run("AI disabled", func(t *testing.T) {
		scheduler := &recordingScheduler{}
		cfg := &config.Config{AI: config.AIConfig{Enabled: boolPointer(false)}}

		require.NoError(t, addScheduledJobs(scheduler, cfg, nil, nil, serverRepos{}))
		assert.Equal(t, []string{"import_cleanup"}, scheduler.names)
	})

	t.Run("embedding enabled without summary", func(t *testing.T) {
		scheduler := &recordingScheduler{}
		cfg := &config.Config{
			AI: config.AIConfig{
				Enabled:        boolPointer(true),
				EmbedEnabled:   boolPointer(true),
				SummaryEnabled: boolPointer(false),
			},
			AIJob: config.AIJobConfig{EmbeddingDelaySeconds: 30},
		}

		require.NoError(t, addScheduledJobs(scheduler, cfg, nil, nil, serverRepos{}))
		assert.ElementsMatch(
			t,
			[]string{"import_cleanup", "ai_embedding", "embedding_cache_cleanup"},
			scheduler.names,
		)
		assert.NotContains(t, scheduler.names, "ai_summary")
	})
}
