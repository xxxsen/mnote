package filestore

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"path"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

var (
	errS3ConfigRequired = errors.New("s3 endpoint/bucket/secret_id/secret_key are required")
	errFileKeyRequired  = errors.New("file key is required")
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
	client  *s3.Client
	bucket  string
	prefix  string
	baseURL string
}

func init() {
	Register("s3", createS3Store)
}

func createS3Store(args any) (Store, error) {
	cfg := &s3Config{}
	if err := decodeConfig(args, cfg); err != nil {
		return nil, fmt.Errorf("decode s3 config: %w", err)
	}
	if cfg.Endpoint == "" || cfg.Bucket == "" ||
		cfg.SecretID == "" || cfg.SecretKey == "" {
		return nil, errS3ConfigRequired
	}
	if cfg.Region == "" {
		cfg.Region = "cn"
	}
	endpoint := strings.TrimSpace(cfg.Endpoint)
	if endpoint != "" && !strings.HasPrefix(endpoint, "http://") && !strings.HasPrefix(endpoint, "https://") {
		if cfg.UseSSL {
			endpoint = "https://" + strings.TrimRight(endpoint, "/")
		} else {
			endpoint = "http://" + strings.TrimRight(endpoint, "/")
		}
	}
	awsCfg, err := config.LoadDefaultConfig(
		context.Background(),
		config.WithRegion(cfg.Region),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(cfg.SecretID, cfg.SecretKey, "")),
	)
	if err != nil {
		return nil, fmt.Errorf("load aws config: %w", err)
	}
	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.RequestChecksumCalculation = aws.RequestChecksumCalculationWhenRequired
		o.ResponseChecksumValidation = aws.ResponseChecksumValidationWhenRequired
		if endpoint != "" {
			o.BaseEndpoint = aws.String(endpoint)
			o.UsePathStyle = true
		}
	})
	return &s3Store{
		client:  client,
		bucket:  cfg.Bucket,
		prefix:  strings.Trim(cfg.Prefix, "/"),
		baseURL: buildBaseURL(cfg),
	}, nil
}

func (s *s3Store) Save(ctx context.Context, key string, r ReadSeekCloser, size int64) error {
	if key == "" {
		return errFileKeyRequired
	}
	objectKey, err := s.objectKey(key)
	if err != nil {
		return fmt.Errorf("resolve object key: %w", err)
	}
	_, err = s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(s.bucket),
		Key:           aws.String(objectKey),
		Body:          r,
		ContentLength: aws.Int64(size),
	})
	if err != nil {
		return fmt.Errorf("put object: %w", err)
	}
	return nil
}

func (s *s3Store) Open(ctx context.Context, key string) (io.ReadCloser, error) {
	objectKey, err := s.objectKey(key)
	if err != nil {
		return nil, fmt.Errorf("resolve object key: %w", err)
	}
	resp, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return nil, fmt.Errorf("get object: %w", err)
	}
	return resp.Body, nil
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
	if !strings.HasPrefix(key, "http://") && !strings.HasPrefix(key, "https://") {
		return s.applyPrefix(key), nil
	}
	u, err := url.Parse(key)
	if err != nil {
		return "", fmt.Errorf("parse key url: %w", err)
	}
	trimmed := s.stripBasePath(strings.TrimPrefix(u.Path, "/"))
	return s.applyPrefix(trimmed), nil
}

func (s *s3Store) stripBasePath(p string) string {
	if s.baseURL == "" {
		return p
	}
	base, _ := url.Parse(s.baseURL)
	if base == nil {
		return p
	}
	basePath := strings.TrimPrefix(base.Path, "/")
	if basePath != "" && strings.HasPrefix(p, basePath+"/") {
		return strings.TrimPrefix(p, basePath+"/")
	}
	return p
}

func (s *s3Store) applyPrefix(key string) string {
	if s.prefix != "" && !strings.HasPrefix(key, s.prefix+"/") {
		return path.Join(s.prefix, key)
	}
	return key
}

func buildBaseURL(cfg *s3Config) string {
	endpoint := strings.TrimSpace(cfg.Endpoint)
	if endpoint == "" || cfg.Bucket == "" {
		return ""
	}
	switch {
	case strings.HasPrefix(endpoint, "http://") || strings.HasPrefix(endpoint, "https://"):
		endpoint = strings.TrimRight(endpoint, "/")
	case cfg.UseSSL:
		endpoint = "https://" + strings.TrimRight(endpoint, "/")
	default:
		endpoint = "http://" + strings.TrimRight(endpoint, "/")
	}
	base := endpoint + "/" + strings.Trim(cfg.Bucket, "/")
	if cfg.Prefix != "" {
		base = base + "/" + strings.Trim(cfg.Prefix, "/")
	}
	return base
}
