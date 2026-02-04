package config

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/xxxsen/common/logger"
)

type Config struct {
	Database       DatabaseConfig     `json:"database"`
	JWTSecret      string             `json:"jwt_secret"`
	Port           int                `json:"port"`
	JWTTTLHours    int                `json:"jwt_ttl_hours"`
	VersionMaxKeep int                `json:"version_max_keep"`
	MaxUploadSize  int64              `json:"max_upload_size"`
	LogConfig      logger.LogConfig   `json:"log_config"`
	FileStore      FileStoreConfig    `json:"file_store"`
	AI             AIConfig           `json:"ai"`
	AIJob          AIJobConfig        `json:"ai_job"`
	OAuth          OAuthConfig        `json:"oauth"`
	Mail           MailConfig         `json:"mail"`
	Properties     Properties         `json:"properties"`
	AIProvider     []AIProviderConfig `json:"ai_provider"`
}

type DatabaseConfig struct {
	DSN      string `json:"dsn"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user"`
	Password string `json:"password"`
	DBName   string `json:"dbname"`
	SSLMode  string `json:"sslmode"`
}

type FileStoreConfig struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

type AIProviderConfig struct {
	Name string      `json:"name"`
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

type AIFeatureConfig struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
}

func (f AIFeatureConfig) WithDefaults(c AIConfig) AIFeatureConfig {
	if f.Provider == "" {
		f.Provider = c.Provider
	}
	if f.Model == "" {
		f.Model = c.Model
	}
	return f
}

type AIConfig struct {
	Provider      string            `json:"provider"`
	Model         string            `json:"model"`
	Polish        []AIFeatureConfig `json:"polish"`
	Generate      []AIFeatureConfig `json:"generate"`
	Tagging       []AIFeatureConfig `json:"tagging"`
	Summary       []AIFeatureConfig `json:"summary"`
	Embed         []AIFeatureConfig `json:"embed"`
	Timeout       int               `json:"timeout"`
	MaxInputChars int               `json:"max_input_chars"`
}

type AIJobConfig struct {
	SummaryDelaySeconds   int64 `json:"summary_delay_seconds"`
	EmbeddingDelaySeconds int64 `json:"embedding_delay_seconds"`
}

type OAuthConfig struct {
	Github OAuthProviderConfig `json:"github"`
	Google OAuthProviderConfig `json:"google"`
}

type OAuthProviderConfig struct {
	ClientID     string   `json:"client_id"`
	ClientSecret string   `json:"client_secret"`
	RedirectURL  string   `json:"redirect_url"`
	Scopes       []string `json:"scopes"`
}

type MailConfig struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
	From     string `json:"from"`
}

type Properties struct {
	EnableGithubOauth   bool `json:"enable_github_oauth"`
	EnableGoogleOauth   bool `json:"enable_google_oauth"`
	EnableUserRegister  bool `json:"enable_user_register"`
	EnableEmailRegister bool `json:"enable_email_register"`
	EnableTestMode      bool `json:"enable_test_mode"`
}

func Load(path string) (*Config, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open config: %w", err)
	}
	defer file.Close()

	var cfg Config
	if err := json.NewDecoder(file).Decode(&cfg); err != nil {
		return nil, fmt.Errorf("decode config: %w", err)
	}
	if cfg.Database.Host == "" && cfg.Database.DSN == "" {
		return nil, fmt.Errorf("database.host or database.dsn is required")
	}
	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("jwt_secret is required")
	}
	if cfg.Port == 0 {
		return nil, fmt.Errorf("port is required")
	}
	if cfg.JWTTTLHours == 0 {
		cfg.JWTTTLHours = 72
	}
	if cfg.VersionMaxKeep == 0 {
		cfg.VersionMaxKeep = 10
	}
	if cfg.MaxUploadSize <= 0 {
		cfg.MaxUploadSize = 20 * 1024 * 1024
	}
	if cfg.LogConfig.Level == "" {
		cfg.LogConfig.Level = "info"
	}
	if cfg.FileStore.Type == "" {
		cfg.FileStore.Type = "local"
	}
	if cfg.AI.Timeout == 0 {
		cfg.AI.Timeout = 30
	}
	if cfg.AI.MaxInputChars == 0 {
		cfg.AI.MaxInputChars = 32000
	}
	if cfg.AIJob.SummaryDelaySeconds == 0 {
		cfg.AIJob.SummaryDelaySeconds = 300
	}
	if cfg.AIJob.EmbeddingDelaySeconds == 0 {
		cfg.AIJob.EmbeddingDelaySeconds = 300
	}
	if cfg.Properties.EnableGithubOauth && len(cfg.OAuth.Github.Scopes) == 0 {
		cfg.OAuth.Github.Scopes = []string{"user:email"}
	}
	if cfg.Properties.EnableGoogleOauth && len(cfg.OAuth.Google.Scopes) == 0 {
		cfg.OAuth.Google.Scopes = []string{"openid", "email", "profile"}
	}
	return &cfg, nil
}
