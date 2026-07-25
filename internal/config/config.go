package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/xxxsen/common/logger"
)

type Config struct {
	Database        DatabaseConfig     `json:"database"`
	JWTSecret       string             `json:"jwt_secret"`
	Port            int                `json:"port"`
	JWTTTLHours     int                `json:"jwt_ttl_hours"`
	VersionMaxKeep  int                `json:"version_max_keep"`
	MaxUploadSize   int64              `json:"max_upload_size"`
	MaxJSONBodySize int64              `json:"max_json_body_size"`
	MaxDocumentSize int64              `json:"max_document_size"`
	MaxTemplateSize int64              `json:"max_template_size"`
	LogConfig       logger.LogConfig   `json:"log_config"`
	CORS            CORSConfig         `json:"cors"`
	FileStore       FileStoreConfig    `json:"file_store"`
	AI              AIConfig           `json:"ai"`
	AIJob           AIJobConfig        `json:"ai_job"`
	OAuth           OAuthConfig        `json:"oauth"`
	Mail            MailConfig         `json:"mail"`
	Properties      Properties         `json:"properties"`
	Banner          BannerConfig       `json:"banner"`
	AIProvider      []AIProviderConfig `json:"ai_provider"`
}

type DatabaseConfig struct {
	DSN                    string `json:"dsn"`
	Host                   string `json:"host"`
	Port                   int    `json:"port"`
	User                   string `json:"user"`
	Password               string `json:"password"`
	DBName                 string `json:"dbname"`
	SSLMode                string `json:"sslmode"`
	MaxOpenConns           int    `json:"max_open_conns"`
	MaxIdleConns           int    `json:"max_idle_conns"`
	ConnMaxLifetimeSeconds int    `json:"conn_max_lifetime_seconds"`
	ConnMaxIdleTimeSeconds int    `json:"conn_max_idle_time_seconds"`
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

type AIEmbeddingConfig struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
}

func (f AIEmbeddingConfig) WithDefaults(c AIConfig) AIEmbeddingConfig {
	if f.Provider == "" {
		f.Provider = c.Provider
	}
	if f.Model == "" {
		f.Model = c.Model
	}
	return f
}

type AIConfig struct {
	Enabled  *bool               `json:"enabled"`
	Provider string              `json:"provider"`
	Model    string              `json:"model"`
	Embed    []AIEmbeddingConfig `json:"embed"`
}

func (c AIConfig) IsEnabled() bool {
	if c.Enabled != nil {
		return *c.Enabled
	}
	return c.Provider != "" || c.Model != "" || len(c.Embed) > 0
}

type AIJobConfig struct {
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
	errDatabaseRequired      = errors.New("database.host or database.dsn is required")
	errJWTSecretRequired     = errors.New("jwt_secret is required")
	errPortRequired          = errors.New("port is required")
	errTrailingConfig        = errors.New("config must contain exactly one JSON object")
	errInvalidLimits         = errors.New("TTL, upload, and text limits must be positive")
	errInvalidDatabasePool   = errors.New("invalid database pool configuration")
	errInvalidAIConfig       = errors.New("invalid embedding configuration")
	errIncompleteMailConfig  = errors.New("mail host, port, and from are required when email registration is enabled")
	errIncompleteOAuthConfig = errors.New("oauth client id, secret, and redirect URL are required")
)

func Load(path string) (*Config, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open config: %w", err)
	}
	defer func() { _ = file.Close() }()

	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	var cfg Config
	if err := decoder.Decode(&cfg); err != nil {
		return nil, fmt.Errorf("decode config: %w", err)
	}
	if err := ensureJSONEOF(decoder); err != nil {
		return nil, err
	}
	cfg.applyDefaults()
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func ensureJSONEOF(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return errTrailingConfig
		}
		return fmt.Errorf("decode trailing config: %w", err)
	}
	return nil
}

func (c *Config) Validate() error {
	if err := c.validateCore(); err != nil {
		return err
	}
	if err := c.validateDatabase(); err != nil {
		return err
	}
	if err := c.validateAI(); err != nil {
		return err
	}
	return c.validateOptionalFeatures()
}

func (c *Config) validateCore() error {
	if c.Database.Host == "" && c.Database.DSN == "" {
		return errDatabaseRequired
	}
	if c.JWTSecret == "" {
		return errJWTSecretRequired
	}
	if c.Port < 1 || c.Port > 65535 {
		return errPortRequired
	}
	if c.JWTTTLHours <= 0 || c.VersionMaxKeep < 0 ||
		c.MaxUploadSize <= 0 || c.MaxJSONBodySize <= 0 ||
		c.MaxDocumentSize <= 0 || c.MaxTemplateSize <= 0 {
		return errInvalidLimits
	}
	return nil
}

func (c *Config) validateDatabase() error {
	if c.Database.MaxOpenConns <= 0 || c.Database.MaxIdleConns < 0 ||
		c.Database.MaxIdleConns > c.Database.MaxOpenConns ||
		c.Database.ConnMaxLifetimeSeconds <= 0 ||
		c.Database.ConnMaxIdleTimeSeconds <= 0 {
		return errInvalidDatabasePool
	}
	return nil
}

func (c *Config) validateAI() error {
	if !c.AI.IsEnabled() {
		return nil
	}
	if c.AIJob.EmbeddingDelaySeconds <= 0 {
		return errInvalidAIConfig
	}
	embeddings := c.AI.Embed
	if len(embeddings) == 0 {
		embeddings = []AIEmbeddingConfig{{}}
	}
	for _, embedding := range embeddings {
		resolved := embedding.WithDefaults(c.AI)
		if strings.TrimSpace(resolved.Provider) == "" || strings.TrimSpace(resolved.Model) == "" {
			return errInvalidAIConfig
		}
	}
	return nil
}

func (c *Config) validateOptionalFeatures() error {
	if c.Properties.EnableGithubOauth {
		if err := validateOAuthProvider("github", c.OAuth.Github); err != nil {
			return err
		}
	}
	if c.Properties.EnableGoogleOauth {
		if err := validateOAuthProvider("google", c.OAuth.Google); err != nil {
			return err
		}
	}
	if c.Properties.EnableEmailRegister &&
		(strings.TrimSpace(c.Mail.Host) == "" || c.Mail.Port <= 0 || strings.TrimSpace(c.Mail.From) == "") {
		return errIncompleteMailConfig
	}
	return nil
}

func validateOAuthProvider(name string, provider OAuthProviderConfig) error {
	if strings.TrimSpace(provider.ClientID) == "" ||
		strings.TrimSpace(provider.ClientSecret) == "" ||
		strings.TrimSpace(provider.RedirectURL) == "" {
		return fmt.Errorf("%w: %s", errIncompleteOAuthConfig, name)
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
	if c.MaxJSONBodySize == 0 {
		c.MaxJSONBodySize = 2 * 1024 * 1024
	}
	if c.MaxDocumentSize == 0 {
		c.MaxDocumentSize = 1024 * 1024
	}
	if c.MaxTemplateSize == 0 {
		c.MaxTemplateSize = 1024 * 1024
	}
	if c.Database.MaxOpenConns == 0 {
		c.Database.MaxOpenConns = 20
	}
	if c.Database.MaxIdleConns == 0 {
		c.Database.MaxIdleConns = 10
		if c.Database.MaxOpenConns < c.Database.MaxIdleConns {
			c.Database.MaxIdleConns = c.Database.MaxOpenConns
		}
	}
	if c.Database.ConnMaxLifetimeSeconds == 0 {
		c.Database.ConnMaxLifetimeSeconds = 30 * 60
	}
	if c.Database.ConnMaxIdleTimeSeconds == 0 {
		c.Database.ConnMaxIdleTimeSeconds = 5 * 60
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
