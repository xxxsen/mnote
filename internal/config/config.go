package config

import (
	"encoding/json"
	"errors"
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
	CORS           CORSConfig         `json:"cors"`
	FileStore      FileStoreConfig    `json:"file_store"`
	AI             AIConfig           `json:"ai"`
	AIJob          AIJobConfig        `json:"ai_job"`
	OAuth          OAuthConfig        `json:"oauth"`
	Mail           MailConfig         `json:"mail"`
	Properties     Properties         `json:"properties"`
	Banner         BannerConfig       `json:"banner"`
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

type CORSConfig struct {
	AllowOrigins []string `json:"allow_origins"`
}

type FileStoreConfig struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

type AIProviderConfig struct {
	Name string `json:"name"`
	Type string `json:"type"`
	Data any    `json:"data"`
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

type BannerConfig struct {
	Enable   bool   `json:"enable"`
	Title    string `json:"title"`
	Wording  string `json:"wording"`
	Redirect string `json:"redirect"`
}

var (
	errDatabaseRequired  = errors.New("database.host or database.dsn is required")
	errJWTSecretRequired = errors.New("jwt_secret is required")
	errPortRequired      = errors.New("port is required")
)

func Load(path string) (*Config, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open config: %w", err)
	}
	defer func() { _ = file.Close() }()

	var cfg Config
	if err := json.NewDecoder(file).Decode(&cfg); err != nil {
		return nil, fmt.Errorf("decode config: %w", err)
	}
	if err := cfg.validate(); err != nil {
		return nil, err
	}
	cfg.applyDefaults()
	return &cfg, nil
}

func (c *Config) validate() error {
	if c.Database.Host == "" && c.Database.DSN == "" {
		return errDatabaseRequired
	}
	if c.JWTSecret == "" {
		return errJWTSecretRequired
	}
	if c.Port == 0 {
		return errPortRequired
	}
	return nil
}

func (c *Config) applyDefaults() {
	if c.JWTTTLHours == 0 {
		c.JWTTTLHours = 72
	}
	if c.VersionMaxKeep == 0 {
		c.VersionMaxKeep = 10
	}
	if c.MaxUploadSize <= 0 {
		c.MaxUploadSize = 20 * 1024 * 1024
	}
	if c.LogConfig.Level == "" {
		c.LogConfig.Level = "info"
	}
	if c.FileStore.Type == "" {
		c.FileStore.Type = "local"
	}
	c.applyAIDefaults()
	c.applyOAuthDefaults()
}

func (c *Config) applyAIDefaults() {
	if c.AI.Timeout == 0 {
		c.AI.Timeout = 30
	}
	if c.AI.MaxInputChars == 0 {
		c.AI.MaxInputChars = 64 * 1024
	}
	if c.AIJob.SummaryDelaySeconds == 0 {
		c.AIJob.SummaryDelaySeconds = 300
	}
	if c.AIJob.EmbeddingDelaySeconds == 0 {
		c.AIJob.EmbeddingDelaySeconds = 300
	}
}

func (c *Config) applyOAuthDefaults() {
	if c.Properties.EnableGithubOauth && len(c.OAuth.Github.Scopes) == 0 {
		c.OAuth.Github.Scopes = []string{"user:email"}
	}
	if c.Properties.EnableGoogleOauth && len(c.OAuth.Google.Scopes) == 0 {
		c.OAuth.Google.Scopes = []string{"openid", "email", "profile"}
	}
}
