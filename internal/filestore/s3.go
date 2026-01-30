package filestore

import (
	"context"
	"fmt"
	"io"
	"net/url"
	"path"
	"strings"

	commons3 "github.com/xxxsen/common/s3"
)

type s3Config struct {
	Endpoint  string `json:"endpoint"`
	SecretID  string `json:"secret_id"`
	SecretKey string `json:"secret_key"`
	Bucket    string `json:"bucket"`
	Region    string `json:"region"`
	Prefix    string `json:"prefix"`
	UseSSL    bool   `json:"use_ssl"`
}

type s3Store struct {
	client  *commons3.S3Client
	prefix  string
	baseURL string
}

func init() {
	Register("s3", createS3Store)
}

func createS3Store(args interface{}) (Store, error) {
	config := &s3Config{}
	if err := decodeConfig(args, config); err != nil {
		return nil, err
	}
	if config.Endpoint == "" || config.Bucket == "" || config.SecretID == "" || config.SecretKey == "" {
		return nil, fmt.Errorf("s3 endpoint/bucket/secret_id/secret_key are required")
	}
	if config.Region == "" {
		config.Region = "cn"
	}
	client, err := commons3.New(
		commons3.WithEndpoint(config.Endpoint),
		commons3.WithSecret(config.SecretID, config.SecretKey),
		commons3.WithBucket(config.Bucket),
		commons3.WithRegion(config.Region),
		commons3.WithSSL(config.UseSSL),
	)
	if err != nil {
		return nil, err
	}
	return &s3Store{
		client:  client,
		prefix:  strings.Trim(config.Prefix, "/"),
		baseURL: buildBaseURL(config),
	}, nil
}

func (s *s3Store) Save(ctx context.Context, key string, r ReadSeekCloser, size int64) error {
	if key == "" {
		return fmt.Errorf("file key is required")
	}
	objectKey, err := s.objectKey(key)
	if err != nil {
		return err
	}
	if _, err := s.client.Upload(ctx, objectKey, r, size); err != nil {
		return err
	}
	return nil
}

func (s *s3Store) Open(ctx context.Context, key string) (io.ReadCloser, error) {
	objectKey, err := s.objectKey(key)
	if err != nil {
		return nil, err
	}
	return s.client.Download(ctx, objectKey)
}

func (s *s3Store) GenerateFileRef(userID, filename string) string {
	objectKey := buildFileKey(userID, filename)
	if s.prefix != "" {
		objectKey = path.Join(s.prefix, objectKey)
	}
	if s.baseURL == "" {
		return objectKey
	}
	return strings.TrimRight(s.baseURL, "/") + "/" + objectKey
}

func (s *s3Store) objectKey(key string) (string, error) {
	if strings.HasPrefix(key, "http://") || strings.HasPrefix(key, "https://") {
		u, err := url.Parse(key)
		if err != nil {
			return "", err
		}
		trimmed := strings.TrimPrefix(u.Path, "/")
		if s.baseURL != "" {
			base, _ := url.Parse(s.baseURL)
			if base != nil {
				basePath := strings.TrimPrefix(base.Path, "/")
				if basePath != "" && strings.HasPrefix(trimmed, basePath+"/") {
					trimmed = strings.TrimPrefix(trimmed, basePath+"/")
				}
			}
		}
		if s.prefix != "" && strings.HasPrefix(trimmed, s.prefix+"/") {
			return trimmed, nil
		}
		if s.prefix != "" {
			return path.Join(s.prefix, trimmed), nil
		}
		return trimmed, nil
	}
	if s.prefix != "" {
		return path.Join(s.prefix, key), nil
	}
	return key, nil
}

func buildBaseURL(cfg *s3Config) string {
	endpoint := strings.TrimSpace(cfg.Endpoint)
	if endpoint == "" || cfg.Bucket == "" {
		return ""
	}
	if strings.HasPrefix(endpoint, "http://") || strings.HasPrefix(endpoint, "https://") {
		endpoint = strings.TrimRight(endpoint, "/")
	} else if cfg.UseSSL {
		endpoint = "https://" + strings.TrimRight(endpoint, "/")
	} else {
		endpoint = "http://" + strings.TrimRight(endpoint, "/")
	}
	base := endpoint + "/" + strings.Trim(cfg.Bucket, "/")
	if cfg.Prefix != "" {
		base = base + "/" + strings.Trim(cfg.Prefix, "/")
	}
	return base
}
