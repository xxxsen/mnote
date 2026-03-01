package filestore

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type localConfig struct {
	Dir string `json:"dir"`
}

type localStore struct {
	dir string
}

func init() {
	Register("local", createLocalStore)
}

func createLocalStore(args interface{}) (Store, error) {
	config := &localConfig{}
	if err := decodeConfig(args, config); err != nil {
		return nil, err
	}
	if config.Dir == "" {
		return nil, fmt.Errorf("local store dir is required")
	}
	return &localStore{dir: config.Dir}, nil
}

func (s *localStore) Save(ctx context.Context, key string, r ReadSeekCloser, size int64) error {
	_ = ctx
	if err := s.ensureDir(); err != nil {
		return err
	}
	if strings.Contains(key, "/") || strings.Contains(key, "\\") {
		return fmt.Errorf("invalid file key")
	}
	path := filepath.Join(s.dir, key)
	out, err := os.Create(path)
	if err != nil {
		return err
	}
	defer func() { _ = out.Close() }()
	if _, err := r.Seek(0, io.SeekStart); err != nil {
		return err
	}
	_, err = io.Copy(out, r)
	return err
}

func (s *localStore) Open(ctx context.Context, key string) (io.ReadCloser, error) {
	_ = ctx
	if strings.Contains(key, "/") || strings.Contains(key, "\\") {
		return nil, fmt.Errorf("invalid file key")
	}
	path := filepath.Join(s.dir, key)
	return os.Open(path)
}

func (s *localStore) GenerateFileRef(userID, filename string) string {
	return buildFileKey(userID, filename)
}

func (s *localStore) ensureDir() error {
	return os.MkdirAll(s.dir, 0o755)
}
