package config

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/xxxsen/common/logger"
)

type Config struct {
	DBPath      string           `json:"db_path"`
	JWTSecret   string           `json:"jwt_secret"`
	Port        int              `json:"port"`
	JWTTTLHours int              `json:"jwt_ttl_hours"`
	LogConfig   logger.LogConfig `json:"log_config"`
	FileStore   FileStoreConfig  `json:"file_store"`
	AI          AIConfig         `json:"ai"`
}

type FileStoreConfig struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

type AIConfig struct {
	Provider      string `json:"provider"`
	APIKey        string `json:"api_key"`
	Model         string `json:"model"`
	Timeout       int    `json:"timeout"`
	MaxInputChars int    `json:"max_input_chars"`
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
		cfg.AI.Timeout = 10
	}
	if cfg.AI.MaxInputChars == 0 {
		cfg.AI.MaxInputChars = 20000
	}
	if cfg.AI.Model == "" {
		cfg.AI.Model = "flash"
	}
	return &cfg, nil
}
