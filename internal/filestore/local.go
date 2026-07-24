package filestore

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/xxxsen/mnote/internal/pkg/idgen"
)

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
	if err := ValidateFileKey(key); err != nil {
		return err
	}
	if err := s.ensureDir(); err != nil {
		return fmt.Errorf("ensure dir: %w", err)
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
	if err := ValidateFileKey(key); err != nil {
		return nil, err
	}
	path := filepath.Join(s.dir, key)
	f, err := os.Open(path)
	if err != nil {
		return nil, normalizeLocalError("open file", err)
	}
	info, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, fmt.Errorf("stat opened file: %w", err)
	}
	if !info.Mode().IsRegular() {
		_ = f.Close()
		return nil, fmt.Errorf("open file: %w", ErrObjectNotFound)
	}
	return f, nil
}

func (s *localStore) Stat(_ context.Context, key string) (ObjectInfo, error) {
	if err := ValidateFileKey(key); err != nil {
		return ObjectInfo{}, err
	}
	info, err := os.Stat(filepath.Join(s.dir, key))
	if err != nil {
		return ObjectInfo{}, normalizeLocalError("stat file", err)
	}
	if !info.Mode().IsRegular() {
		return ObjectInfo{}, fmt.Errorf("stat file: %w", ErrObjectNotFound)
	}
	return ObjectInfo{Size: info.Size()}, nil
}

func (s *localStore) OpenRange(_ context.Context, key string, value ByteRange) (io.ReadCloser, error) {
	if err := ValidateFileKey(key); err != nil {
		return nil, err
	}
	if value.Start < 0 || value.End < value.Start {
		return nil, fmt.Errorf("open range: %w", errInvalidByteRange)
	}
	f, err := os.Open(filepath.Join(s.dir, key))
	if err != nil {
		return nil, normalizeLocalError("open range", err)
	}
	info, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, fmt.Errorf("stat range file: %w", err)
	}
	if !info.Mode().IsRegular() {
		_ = f.Close()
		return nil, fmt.Errorf("open range: %w", ErrObjectNotFound)
	}
	if value.Start >= info.Size() || value.End >= info.Size() {
		_ = f.Close()
		return nil, fmt.Errorf("open range: %w", errRangeOutOfBounds)
	}
	return &sectionReadCloser{
		SectionReader: io.NewSectionReader(f, value.Start, value.End-value.Start+1),
		closer:        f,
	}, nil
}

func (s *localStore) Delete(_ context.Context, key string) error {
	if err := ValidateFileKey(key); err != nil {
		return err
	}
	if err := os.Remove(filepath.Join(s.dir, key)); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
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

type sectionReadCloser struct {
	*io.SectionReader
	closer io.Closer
}

func (r *sectionReadCloser) Close() error {
	if err := r.closer.Close(); err != nil {
		return fmt.Errorf("close ranged file: %w", err)
	}
	return nil
}

func normalizeLocalError(operation string, err error) error {
	if errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("%s: %w", operation, ErrObjectNotFound)
	}
	return fmt.Errorf("%s: %w", operation, err)
}
