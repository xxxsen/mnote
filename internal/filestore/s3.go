package filestore

import (
	"context"
	"fmt"
	"path"
	"strings"

	commons3 "github.com/xxxsen/common/s3"
)

type s3Store struct {
	client *commons3.S3Client
	prefix string
}

func NewS3Store(client *commons3.S3Client, prefix string) Store {
	return &s3Store{client: client, prefix: strings.Trim(prefix, "/")}
}

func (s *s3Store) Type() string {
	return "s3"
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
