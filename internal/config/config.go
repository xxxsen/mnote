package config

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/xxxsen/common/logger"
)

type Config struct {
	DBPath         string           `json:"db_path"`
	JWTSecret      string           `json:"jwt_secret"`
	Port           int              `json:"port"`
	JWTTTLHours    int              `json:"jwt_ttl_hours"`
	VersionMaxKeep int              `json:"version_max_keep"`
	LogConfig      logger.LogConfig `json:"log_config"`
	FileStore      FileStoreConfig  `json:"file_store"`
	AI             AIConfig         `json:"ai"`
	OAuth          OAuthConfig      `json:"oauth"`
	Mail           MailConfig       `json:"mail"`
	Auth           AuthConfig       `json:"auth"`
}

type FileStoreConfig struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

type AIConfig struct {
	Provider      string      `json:"provider"`
	Model         string      `json:"model"`
	Timeout       int         `json:"timeout"`
	MaxInputChars int         `json:"max_input_chars"`
	Data          interface{} `json:"data"`
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
	Enabled      bool     `json:"enabled"`
}

type MailConfig struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
	From     string `json:"from"`
}

type AuthConfig struct {
	AllowRegister *bool `json:"allow_register"`
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
	if cfg.DBPath == "" {
		return nil, fmt.Errorf("db_path is required")
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
	if cfg.LogConfig.Level == "" {
		cfg.LogConfig.Level = "info"
	}
	if cfg.FileStore.Type == "" {
		cfg.FileStore.Type = "local"
	}
	if cfg.AI.Provider == "" {
		cfg.AI.Provider = "gemini"
	}
	if cfg.AI.Timeout == 0 {
		cfg.AI.Timeout = 30
	}
	if cfg.AI.MaxInputChars == 0 {
		cfg.AI.MaxInputChars = 32000
	}
	if cfg.AI.Model == "" {
		cfg.AI.Model = "gemini-3-flash-preview"
	}
	if cfg.Auth.AllowRegister == nil {
		value := true
		cfg.Auth.AllowRegister = &value
	}
	if cfg.OAuth.Github.Enabled && len(cfg.OAuth.Github.Scopes) == 0 {
		cfg.OAuth.Github.Scopes = []string{"user:email"}
	}
	if cfg.OAuth.Google.Enabled && len(cfg.OAuth.Google.Scopes) == 0 {
		cfg.OAuth.Google.Scopes = []string{"openid", "email", "profile"}
	}
	return &cfg, nil
}
