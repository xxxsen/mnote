package filestore

import (
	"context"
	"fmt"
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
	PublicURL string `json:"public_url"`
	UseSSL    bool   `json:"use_ssl"`
}

type s3Store struct {
	client    *commons3.S3Client
	prefix    string
	publicURL string
	endpoint  string
	bucket    string
	useSSL    bool
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
		client:    client,
		prefix:    strings.Trim(config.Prefix, "/"),
		publicURL: config.PublicURL,
		endpoint:  config.Endpoint,
		bucket:    config.Bucket,
		useSSL:    config.UseSSL,
	}, nil
}

func (s *s3Store) Type() string {
	return "s3"
}

func (s *s3Store) URL(key, baseURL string) string {
	_ = baseURL
	objectKey := key
	if s.prefix != "" {
		objectKey = path.Join(s.prefix, key)
	}
	objectKey = strings.TrimPrefix(objectKey, "/")
	base := strings.TrimSuffix(s.publicURL, "/")
	if base == "" {
		base = buildS3BaseURL(s.endpoint, s.bucket, s.useSSL)
	}
	return strings.TrimSuffix(base, "/") + "/" + objectKey
}

func (s *s3Store) Save(ctx context.Context, key string, r ReadSeekCloser, size int64) error {
	if key == "" {
		return fmt.Errorf("file key is required")
	}
	objectKey := key
	if s.prefix != "" {
		objectKey = path.Join(s.prefix, key)
	}
	if _, err := s.client.Upload(ctx, objectKey, r, size); err != nil {
		return err
	}
	return nil
}

func (s *s3Store) Open(ctx context.Context, key string) (ReadSeekCloser, error) {
	_ = ctx
	_ = key
	return nil, fmt.Errorf("s3 store does not support open")
}

func buildS3BaseURL(endpoint, bucket string, useSSL bool) string {
	ep := endpoint
	if !strings.HasPrefix(ep, "http://") && !strings.HasPrefix(ep, "https://") {
		scheme := "http"
		if useSSL {
			scheme = "https"
		}
		ep = scheme + "://" + ep
	}
	u, err := url.Parse(ep)
	if err != nil {
		return strings.TrimSuffix(ep, "/") + "/" + bucket
	}
	u.Path = strings.TrimSuffix(u.Path, "/") + "/" + bucket
	return u.String()
}
