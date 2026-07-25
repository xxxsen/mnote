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

func TestLoad_RejectsRemovedAIConfiguration(t *testing.T) {
	removedAIFields := []struct {
		name  string
		field string
	}{
		{name: "polish_enabled", field: `"polish_enabled": true`},
		{name: "generate_enabled", field: `"generate_enabled": true`},
		{name: "tagging_enabled", field: `"tagging_enabled": true`},
		{name: "summary_enabled", field: `"summary_enabled": true`},
		{name: "embed_enabled", field: `"embed_enabled": true`},
		{name: "polish", field: `"polish": []`},
		{name: "generate", field: `"generate": []`},
		{name: "tagging", field: `"tagging": []`},
		{name: "summary", field: `"summary": []`},
		{name: "timeout", field: `"timeout": 30`},
		{name: "max_input_chars", field: `"max_input_chars": 1000`},
	}
	for _, testCase := range removedAIFields {
		t.Run(testCase.name, func(t *testing.T) {
			configJSON := `{
				"database": {"host": "localhost"},
				"jwt_secret": "secret",
				"port": 8080,
				"ai": {` + testCase.field + `}
			}`
			_, err := Load(writeConfig(t, configJSON))
			require.Error(t, err)
			assert.Contains(t, err.Error(), "unknown field")
		})
	}

	t.Run("summary_delay_seconds", func(t *testing.T) {
		configJSON := `{
			"database": {"host": "localhost"},
			"jwt_secret": "secret",
			"port": 8080,
			"ai_job": {"summary_delay_seconds": 60}
		}`
		_, err := Load(writeConfig(t, configJSON))
		require.Error(t, err)
		assert.Contains(t, err.Error(), "unknown field")
	})
}

func TestLoad_DockerExampleConfig(t *testing.T) {
	cfg, err := Load("../../docker/mnote/config.json")
	require.NoError(t, err)
	assert.Equal(t, "mnote-db", cfg.Database.Host)
	assert.True(t, cfg.AI.IsEnabled())
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
		"ai": {"enabled": true, "provider": "openai", "model": "embedding-model"},
		"ai_job": {"embedding_delay_seconds": 20}
	}`
	cfg, err := Load(writeConfig(t, j))
	require.NoError(t, err)
	assert.Equal(t, 24, cfg.JWTTTLHours)
	assert.Equal(t, 5, cfg.VersionMaxKeep)
	assert.Equal(t, int64(100), cfg.MaxUploadSize)
	assert.Equal(t, "debug", cfg.LogConfig.Level)
	assert.Equal(t, "s3", cfg.FileStore.Type)
	assert.True(t, cfg.AI.IsEnabled())
	assert.Equal(t, int64(20), cfg.AIJob.EmbeddingDelaySeconds)
}

func TestAIEmbeddingConfig_WithDefaults(t *testing.T) {
	ac := AIConfig{Provider: "openai", Model: "embedding-model"}

	f := AIEmbeddingConfig{}
	f = f.WithDefaults(ac)
	assert.Equal(t, "openai", f.Provider)
	assert.Equal(t, "embedding-model", f.Model)

	f2 := AIEmbeddingConfig{Provider: "gemini", Model: "embed-v2"}
	f2 = f2.WithDefaults(ac)
	assert.Equal(t, "gemini", f2.Provider)
	assert.Equal(t, "embed-v2", f2.Model)
}

func TestAIConfigEmbeddingSwitch(t *testing.T) {
	t.Run("no configuration disables embedding", func(t *testing.T) {
		cfg := AIConfig{}
		assert.False(t, cfg.IsEnabled())
	})

	t.Run("default provider and model enable embedding", func(t *testing.T) {
		cfg := AIConfig{Provider: "openai", Model: "embedding-model"}
		assert.True(t, cfg.IsEnabled())
	})

	t.Run("explicit disable overrides configured embeddings", func(t *testing.T) {
		enabled := false
		cfg := AIConfig{
			Enabled: &enabled,
			Embed:   []AIEmbeddingConfig{{Provider: "openai", Model: "embedding-model"}},
		}
		assert.False(t, cfg.IsEnabled())
	})

	t.Run("explicit enable is authoritative", func(t *testing.T) {
		enabled := true
		assert.True(t, (AIConfig{Enabled: &enabled}).IsEnabled())
	})
}

func TestLoad_AIEmbeddingValidation(t *testing.T) {
	t.Run("disabled embedding ignores job delay", func(t *testing.T) {
		j := `{
			"database": {"host":"h"}, "jwt_secret": "s", "port": 80,
			"ai": {"enabled": false},
			"ai_job": {"embedding_delay_seconds": -1}
		}`
		cfg, err := Load(writeConfig(t, j))
		require.NoError(t, err)
		assert.False(t, cfg.AI.IsEnabled())
	})

	t.Run("enabled embedding requires provider and model", func(t *testing.T) {
		j := `{
			"database": {"host":"h"}, "jwt_secret": "s", "port": 80,
			"ai": {"enabled": true}
		}`
		_, err := Load(writeConfig(t, j))
		assert.ErrorIs(t, err, errInvalidAIConfig)
	})

	t.Run("enabled embedding validates job delay", func(t *testing.T) {
		j := `{
			"database": {"host":"h"}, "jwt_secret": "s", "port": 80,
			"ai": {"enabled": true, "provider": "p", "model": "m"},
			"ai_job": {"embedding_delay_seconds": -1}
		}`
		_, err := Load(writeConfig(t, j))
		assert.ErrorIs(t, err, errInvalidAIConfig)
	})

	t.Run("embedding entries inherit defaults", func(t *testing.T) {
		j := `{
			"database": {"host":"h"}, "jwt_secret": "s", "port": 80,
			"ai": {
				"enabled": true, "provider": "p", "model": "m",
				"embed": [{"provider": "fallback"}]
			}
		}`
		cfg, err := Load(writeConfig(t, j))
		require.NoError(t, err)
		assert.True(t, cfg.AI.IsEnabled())
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
