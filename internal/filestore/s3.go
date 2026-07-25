package filestore

import (
	"context"
	"errors"
	"fmt"
	"io"
	"path"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/smithy-go"

	"github.com/xxxsen/mnote/internal/pkg/idgen"
)

var errS3ConfigRequired = errors.New("s3 endpoint/bucket/secret_id/secret_key are required")

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
	client    s3API
	bucket    string
	prefix    string
	baseURL   string
	generator idgen.Generator
}

type s3API interface {
	PutObject(
		context.Context, *s3.PutObjectInput, ...func(*s3.Options),
	) (*s3.PutObjectOutput, error)
	GetObject(
		context.Context, *s3.GetObjectInput, ...func(*s3.Options),
	) (*s3.GetObjectOutput, error)
	HeadObject(
		context.Context, *s3.HeadObjectInput, ...func(*s3.Options),
	) (*s3.HeadObjectOutput, error)
	DeleteObject(
		context.Context, *s3.DeleteObjectInput, ...func(*s3.Options),
	) (*s3.DeleteObjectOutput, error)
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
		cfg.Region = "us-east-1"
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
		client:    client,
		bucket:    cfg.Bucket,
		prefix:    strings.Trim(cfg.Prefix, "/"),
		baseURL:   buildBaseURL(cfg),
		generator: idgen.NewCrypto(),
	}, nil
}

func (s *s3Store) Save(ctx context.Context, key string, r ReadSeekCloser, size int64) error {
	if err := ValidateFileKey(key); err != nil {
		return err
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
		return normalizeS3Error("put object", err)
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
		return nil, normalizeS3Error("get object", err)
	}
	if resp == nil || resp.Body == nil {
		return nil, fmt.Errorf("get object: %w", errEmptyObjectBody)
	}
	return resp.Body, nil
}

func (s *s3Store) Stat(ctx context.Context, key string) (ObjectInfo, error) {
	objectKey, err := s.objectKey(key)
	if err != nil {
		return ObjectInfo{}, fmt.Errorf("resolve object key: %w", err)
	}
	resp, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(objectKey),
	})
	if err != nil {
		return ObjectInfo{}, normalizeS3Error("head object", err)
	}
	if resp == nil || resp.ContentLength == nil || *resp.ContentLength < 0 {
		return ObjectInfo{}, fmt.Errorf("head object: %w", errInvalidObjectSize)
	}
	return ObjectInfo{Size: *resp.ContentLength}, nil
}

func (s *s3Store) OpenRange(
	ctx context.Context, key string, value ByteRange,
) (io.ReadCloser, error) {
	if value.Start < 0 || value.End < value.Start {
		return nil, fmt.Errorf("get object range: %w", errInvalidByteRange)
	}
	objectKey, err := s.objectKey(key)
	if err != nil {
		return nil, fmt.Errorf("resolve object key: %w", err)
	}
	rangeValue := fmt.Sprintf("bytes=%d-%d", value.Start, value.End)
	resp, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(objectKey),
		Range:  aws.String(rangeValue),
	})
	if err != nil {
		return nil, normalizeS3Error("get object range", err)
	}
	if resp == nil || resp.Body == nil {
		return nil, fmt.Errorf("get object range: %w", errEmptyObjectBody)
	}
	return resp.Body, nil
}

func (s *s3Store) Delete(ctx context.Context, key string) error {
	objectKey, err := s.objectKey(key)
	if err != nil {
		return fmt.Errorf("resolve object key: %w", err)
	}
	if _, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(objectKey),
	}); err != nil {
		return normalizeS3Error("delete object", err)
	}
	return nil
}

func (s *s3Store) GenerateFileRef(userID, filename string) (string, error) {
	generator := s.generator
	if generator == nil {
		generator = idgen.NewCrypto()
	}
	return buildFileKey(generator, userID, filename)
}

func (s *s3Store) PublicURL(objectKey string) string {
	if s.baseURL == "" {
		return objectKey
	}
	return strings.TrimRight(s.baseURL, "/") + "/" + objectKey
}

func (s *s3Store) objectKey(key string) (string, error) {
	if err := ValidateFileKey(key); err != nil {
		return "", err
	}
	return s.applyPrefix(key), nil
}

func (s *s3Store) applyPrefix(key string) string {
	if s.prefix != "" {
		return path.Join(s.prefix, key)
	}
	return key
}

func normalizeS3Error(operation string, err error) error {
	var noSuchKey *types.NoSuchKey
	if errors.As(err, &noSuchKey) {
		return fmt.Errorf("%s: %w", operation, ErrObjectNotFound)
	}
	var apiErr smithy.APIError
	if errors.As(err, &apiErr) {
		switch strings.ToLower(apiErr.ErrorCode()) {
		case "nosuchkey", "notfound", "404":
			return fmt.Errorf("%s: %w", operation, ErrObjectNotFound)
		}
	}
	return fmt.Errorf("%s: %w", operation, err)
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
