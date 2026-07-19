package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func writeConfig(t *testing.T, content string) string {
	t.Helper()
	dir := t.TempDir()
	p := filepath.Join(dir, "config.json")
	require.NoError(t, os.WriteFile(p, []byte(content), 0o600))
	return p
}

func validJSON() string {
	return `{
		"database": {"host": "localhost", "port": 5432},
		"jwt_secret": "secret",
		"port": 8080
	}`
}

func TestLoad_Valid(t *testing.T) {
	cfg, err := Load(writeConfig(t, validJSON()))
	require.NoError(t, err)
	assert.Equal(t, "localhost", cfg.Database.Host)
	assert.Equal(t, "secret", cfg.JWTSecret)
	assert.Equal(t, 8080, cfg.Port)
}

func TestLoad_Defaults(t *testing.T) {
	cfg, err := Load(writeConfig(t, validJSON()))
	require.NoError(t, err)
	assert.Equal(t, 72, cfg.JWTTTLHours)
	assert.Equal(t, 10, cfg.VersionMaxKeep)
	assert.Equal(t, int64(20*1024*1024), cfg.MaxUploadSize)
	assert.Equal(t, "info", cfg.LogConfig.Level)
	assert.Equal(t, "local", cfg.FileStore.Type)
	assert.Equal(t, 30, cfg.AI.Timeout)
	assert.Equal(t, 64*1024, cfg.AI.MaxInputChars)
	assert.Equal(t, int64(300), cfg.AIJob.SummaryDelaySeconds)
	assert.Equal(t, int64(300), cfg.AIJob.EmbeddingDelaySeconds)
}

func TestLoad_FileNotFound(t *testing.T) {
	_, err := Load("/nonexistent/config.json")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "open config")
}

func TestLoad_InvalidJSON(t *testing.T) {
	_, err := Load(writeConfig(t, "not-json"))
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "decode config")
}

func TestLoad_MissingDatabaseHost(t *testing.T) {
	_, err := Load(writeConfig(t, `{"jwt_secret": "s", "port": 80}`))
	assert.ErrorIs(t, err, errDatabaseRequired)
}

func TestLoad_MissingJWTSecret(t *testing.T) {
	_, err := Load(writeConfig(t, `{"database": {"host":"h"}, "port": 80}`))
	assert.ErrorIs(t, err, errJWTSecretRequired)
}

func TestLoad_MissingPort(t *testing.T) {
	j := `{"database": {"host":"h"}, "jwt_secret": "s"}`
	_, err := Load(writeConfig(t, j))
	assert.ErrorIs(t, err, errPortRequired)
}

func TestLoad_DSNInsteadOfHost(t *testing.T) {
	j := `{"database": {"dsn":"postgres://localhost/db"}, "jwt_secret": "s", "port": 80}`
	cfg, err := Load(writeConfig(t, j))
	require.NoError(t, err)
	assert.Equal(t, "postgres://localhost/db", cfg.Database.DSN)
}

func TestLoad_CustomDefaults(t *testing.T) {
	j := `{
		"database": {"host":"h"}, "jwt_secret": "s", "port": 80,
		"jwt_ttl_hours": 24,
		"version_max_keep": 5,
		"max_upload_size": 100,
		"log_config": {"level": "debug"},
		"file_store": {"type": "s3"},
		"ai": {"timeout": 60, "max_input_chars": 1024},
		"ai_job": {"summary_delay_seconds": 10, "embedding_delay_seconds": 20}
	}`
	cfg, err := Load(writeConfig(t, j))
	require.NoError(t, err)
	assert.Equal(t, 24, cfg.JWTTTLHours)
	assert.Equal(t, 5, cfg.VersionMaxKeep)
	assert.Equal(t, int64(100), cfg.MaxUploadSize)
	assert.Equal(t, "debug", cfg.LogConfig.Level)
	assert.Equal(t, "s3", cfg.FileStore.Type)
	assert.Equal(t, 60, cfg.AI.Timeout)
	assert.Equal(t, 1024, cfg.AI.MaxInputChars)
	assert.Equal(t, int64(10), cfg.AIJob.SummaryDelaySeconds)
	assert.Equal(t, int64(20), cfg.AIJob.EmbeddingDelaySeconds)
}

func TestAIFeatureConfig_WithDefaults(t *testing.T) {
	ac := AIConfig{Provider: "openai", Model: "gpt-4"}

	f := AIFeatureConfig{}
	f = f.WithDefaults(ac)
	assert.Equal(t, "openai", f.Provider)
	assert.Equal(t, "gpt-4", f.Model)

	f2 := AIFeatureConfig{Provider: "gemini", Model: "pro"}
	f2 = f2.WithDefaults(ac)
	assert.Equal(t, "gemini", f2.Provider)
	assert.Equal(t, "pro", f2.Model)
}

func TestAIConfigFeatureSwitches(t *testing.T) {
	t.Run("no configuration disables AI", func(t *testing.T) {
		cfg := AIConfig{}
		assert.False(t, cfg.IsEnabled())
		assert.False(t, cfg.IsGenerateEnabled())
		assert.False(t, cfg.IsEmbedEnabled())
	})

	t.Run("legacy configuration keeps all features enabled", func(t *testing.T) {
		cfg := AIConfig{Provider: "openai", Model: "model"}
		assert.True(t, cfg.IsEnabled())
		assert.True(t, cfg.IsPolishEnabled())
		assert.True(t, cfg.IsGenerateEnabled())
		assert.True(t, cfg.IsTaggingEnabled())
		assert.True(t, cfg.IsSummaryEnabled())
		assert.True(t, cfg.IsEmbedEnabled())
	})

	t.Run("explicit global disable overrides feature flags", func(t *testing.T) {
		enabled := false
		generate := true
		cfg := AIConfig{Enabled: &enabled, GenerateEnabled: &generate}
		assert.False(t, cfg.IsEnabled())
		assert.False(t, cfg.IsGenerateEnabled())
	})

	t.Run("any feature switch makes unspecified features disabled", func(t *testing.T) {
		enabled := true
		generate := true
		cfg := AIConfig{
			Enabled:         &enabled,
			GenerateEnabled: &generate,
			Provider:        "openai",
			Model:           "model",
		}
		assert.True(t, cfg.IsGenerateEnabled())
		assert.False(t, cfg.IsPolishEnabled())
		assert.False(t, cfg.IsTaggingEnabled())
		assert.False(t, cfg.IsSummaryEnabled())
		assert.False(t, cfg.IsEmbedEnabled())
	})
}

func TestLoad_AIValidationOnlyForEnabledFeatures(t *testing.T) {
	t.Run("disabled AI ignores AI-only limits", func(t *testing.T) {
		j := `{
			"database": {"host":"h"}, "jwt_secret": "s", "port": 80,
			"ai": {"enabled": false, "timeout": -1, "max_input_chars": -1},
			"ai_job": {"summary_delay_seconds": -1, "embedding_delay_seconds": -1}
		}`
		cfg, err := Load(writeConfig(t, j))
		require.NoError(t, err)
		assert.False(t, cfg.AI.IsEnabled())
	})

	t.Run("disabled summary does not validate summary delay", func(t *testing.T) {
		j := `{
			"database": {"host":"h"}, "jwt_secret": "s", "port": 80,
			"ai": {
				"enabled": true, "provider": "p", "model": "m",
				"generate_enabled": true
			},
			"ai_job": {"summary_delay_seconds": -1}
		}`
		cfg, err := Load(writeConfig(t, j))
		require.NoError(t, err)
		assert.True(t, cfg.AI.IsGenerateEnabled())
		assert.False(t, cfg.AI.IsSummaryEnabled())
	})

	t.Run("enabled feature validates shared limits", func(t *testing.T) {
		j := `{
			"database": {"host":"h"}, "jwt_secret": "s", "port": 80,
			"ai": {
				"enabled": true, "provider": "p", "model": "m",
				"generate_enabled": true, "timeout": -1
			}
		}`
		_, err := Load(writeConfig(t, j))
		assert.ErrorIs(t, err, errInvalidAIConfig)
	})
}

func TestApplyOAuthDefaults_GithubScopes(t *testing.T) {
	j := `{
		"database": {"host":"h"}, "jwt_secret": "s", "port": 80,
		"properties": {"enable_github_oauth": true},
		"oauth": {"github": {
			"client_id": "client", "client_secret": "secret",
			"redirect_url": "https://example.test/oauth/github/callback"
		}}
	}`
	cfg, err := Load(writeConfig(t, j))
	require.NoError(t, err)
	assert.Equal(t, []string{"user:email"}, cfg.OAuth.Github.Scopes)
}

func TestApplyOAuthDefaults_GoogleScopes(t *testing.T) {
	j := `{
		"database": {"host":"h"}, "jwt_secret": "s", "port": 80,
		"properties": {"enable_google_oauth": true},
		"oauth": {"google": {
			"client_id": "client", "client_secret": "secret",
			"redirect_url": "https://example.test/oauth/google/callback"
		}}
	}`
	cfg, err := Load(writeConfig(t, j))
	require.NoError(t, err)
	assert.Equal(t, []string{"openid", "email", "profile"}, cfg.OAuth.Google.Scopes)
}

func TestApplyOAuthDefaults_CustomScopes(t *testing.T) {
	j := `{
		"database": {"host":"h"}, "jwt_secret": "s", "port": 80,
		"properties": {"enable_github_oauth": true},
		"oauth": {"github": {
			"client_id": "client", "client_secret": "secret",
			"redirect_url": "https://example.test/oauth/github/callback",
			"scopes": ["repo"]
		}}
	}`
	cfg, err := Load(writeConfig(t, j))
	require.NoError(t, err)
	assert.Equal(t, []string{"repo"}, cfg.OAuth.Github.Scopes)
}
