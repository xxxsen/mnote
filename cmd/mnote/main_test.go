package main

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/ai"
	"github.com/xxxsen/mnote/internal/config"
	"github.com/xxxsen/mnote/internal/schedule"
)

func boolPointer(value bool) *bool {
	return &value
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
