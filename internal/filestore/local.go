package filestore

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/xxxsen/mnote/internal/pkg/idgen"
)

var errInvalidFileKey = errors.New("invalid file key")

type localConfig struct {
	Dir string `json:"dir"`
}

type localStore struct {
	dir       string
	generator idgen.Generator
}

func init() {
	Register("local", createLocalStore)
}

var errDirRequired = errors.New("local store dir is required")

func createLocalStore(args any) (Store, error) {
	cfg := &localConfig{}
	if err := decodeConfig(args, cfg); err != nil {
		return nil, fmt.Errorf("decode config: %w", err)
	}
	if cfg.Dir == "" {
		return nil, errDirRequired
	}
	return &localStore{dir: cfg.Dir, generator: idgen.NewCrypto()}, nil
}

func (s *localStore) Save(_ context.Context, key string, r ReadSeekCloser, _ int64) error {
	if err := s.ensureDir(); err != nil {
		return fmt.Errorf("ensure dir: %w", err)
	}
	if strings.Contains(key, "/") || strings.Contains(key, "\\") {
		return errInvalidFileKey
	}
	path := filepath.Join(s.dir, key)
	out, err := os.Create(path)
	if err != nil {
		return fmt.Errorf("create file: %w", err)
	}
	defer func() { _ = out.Close() }()
	if _, err := r.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("seek: %w", err)
	}
	if _, err := io.Copy(out, r); err != nil {
		return fmt.Errorf("copy: %w", err)
	}
	return nil
}

func (s *localStore) Open(_ context.Context, key string) (io.ReadCloser, error) {
	if strings.Contains(key, "/") || strings.Contains(key, "\\") {
		return nil, errInvalidFileKey
	}
	path := filepath.Join(s.dir, key)
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open file: %w", err)
	}
	return f, nil
}

func (s *localStore) Delete(_ context.Context, key string) error {
	if strings.Contains(key, "/") || strings.Contains(key, "\\") {
		return errInvalidFileKey
	}
	if err := os.Remove(filepath.Join(s.dir, key)); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove file: %w", err)
	}
	return nil
}

func (s *localStore) GenerateFileRef(userID, filename string) (string, error) {
	generator := s.generator
	if generator == nil {
		generator = idgen.NewCrypto()
	}
	return buildFileKey(generator, userID, filename)
}

func (s *localStore) PublicURL(key string) string {
	return "/api/v1/files/" + key
}

func (s *localStore) ensureDir() error {
	if err := os.MkdirAll(s.dir, 0o755); err != nil {
		return fmt.Errorf("mkdir: %w", err)
	}
	return nil
}
