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
}

type FileStoreConfig struct {
	Type      string   `json:"type"`
	Dir       string   `json:"dir"`
	PublicURL string   `json:"public_url"`
	S3        S3Config `json:"s3"`
}

type S3Config struct {
	Endpoint  string `json:"endpoint"`
	SecretID  string `json:"secret_id"`
	SecretKey string `json:"secret_key"`
	Bucket    string `json:"bucket"`
	Region    string `json:"region"`
	Prefix    string `json:"prefix"`
	PublicURL string `json:"public_url"`
	UseSSL    bool   `json:"use_ssl"`
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
	switch cfg.FileStore.Type {
	case "local":
		if cfg.FileStore.Dir == "" {
			return nil, fmt.Errorf("file_store.dir is required for local store")
		}
	case "s3":
		if cfg.FileStore.S3.Endpoint == "" || cfg.FileStore.S3.Bucket == "" || cfg.FileStore.S3.SecretID == "" || cfg.FileStore.S3.SecretKey == "" {
			return nil, fmt.Errorf("file_store.s3 endpoint/bucket/secret_id/secret_key are required for s3 store")
		}
		if cfg.FileStore.S3.Region == "" {
			cfg.FileStore.S3.Region = "cn"
		}
	default:
		return nil, fmt.Errorf("file_store.type must be local or s3")
	}
	return &cfg, nil
}
