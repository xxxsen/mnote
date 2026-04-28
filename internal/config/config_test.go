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

func TestApplyOAuthDefaults_GithubScopes(t *testing.T) {
	j := `{
		"database": {"host":"h"}, "jwt_secret": "s", "port": 80,
		"properties": {"enable_github_oauth": true}
	}`
	cfg, err := Load(writeConfig(t, j))
	require.NoError(t, err)
	assert.Equal(t, []string{"user:email"}, cfg.OAuth.Github.Scopes)
}

func TestApplyOAuthDefaults_GoogleScopes(t *testing.T) {
	j := `{
		"database": {"host":"h"}, "jwt_secret": "s", "port": 80,
		"properties": {"enable_google_oauth": true}
	}`
	cfg, err := Load(writeConfig(t, j))
	require.NoError(t, err)
	assert.Equal(t, []string{"openid", "email", "profile"}, cfg.OAuth.Google.Scopes)
}

func TestApplyOAuthDefaults_CustomScopes(t *testing.T) {
	j := `{
		"database": {"host":"h"}, "jwt_secret": "s", "port": 80,
		"properties": {"enable_github_oauth": true},
		"oauth": {"github": {"scopes": ["repo"]}}
	}`
	cfg, err := Load(writeConfig(t, j))
	require.NoError(t, err)
	assert.Equal(t, []string{"repo"}, cfg.OAuth.Github.Scopes)
}
