package filestore

import (
	"context"
	"fmt"
	"strings"

	"github.com/xxxsen/common/s3"

	"github.com/xxxsen/mnote/internal/config"
)

type Store interface {
	Save(ctx context.Context, key string, r ReadSeekCloser, size int64) error
	Open(ctx context.Context, key string) (ReadSeekCloser, error)
	Type() string
}

type ReadSeekCloser interface {
	Read(p []byte) (n int, err error)
	Seek(offset int64, whence int) (int64, error)
	Close() error
}

func New(cfg config.FileStoreConfig) (Store, error) {
	switch strings.ToLower(cfg.Type) {
	case "local":
		return NewLocalStore(cfg.Dir)
	case "s3":
		client, err := s3.New(
			s3.WithEndpoint(cfg.S3.Endpoint),
			s3.WithSecret(cfg.S3.SecretID, cfg.S3.SecretKey),
			s3.WithBucket(cfg.S3.Bucket),
			s3.WithRegion(cfg.S3.Region),
			s3.WithSSL(cfg.S3.UseSSL),
		)
		if err != nil {
			return nil, err
		}
		return NewS3Store(client, cfg.S3.Prefix), nil
	default:
		return nil, fmt.Errorf("unsupported file store type: %s", cfg.Type)
	}
}
