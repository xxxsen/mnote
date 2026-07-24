package filestore

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"regexp"
	"strings"
	"sync"

	"github.com/xxxsen/mnote/internal/pkg/idgen"
)

var (
	ErrStoreTypeRequired = errors.New("file_store.type is required")
	ErrUnsupportedStore  = errors.New("unsupported file store type")
	ErrConfigRequired    = errors.New("store config is required")
	ErrInvalidFileKey    = errors.New("invalid file key")
	ErrObjectNotFound    = errors.New("object not found")
	errInvalidByteRange  = errors.New("invalid byte range")
	errRangeOutOfBounds  = errors.New("byte range outside object")
	errEmptyObjectBody   = errors.New("empty object response body")
	errInvalidObjectSize = errors.New("invalid object size")
)

type ObjectInfo struct {
	Size int64
}

type ByteRange struct {
	Start int64
	End   int64
}

type Store interface {
	ReadableStore
	Save(ctx context.Context, key string, r ReadSeekCloser, size int64) error
	Delete(ctx context.Context, key string) error
	GenerateFileRef(userID, filename string) (string, error)
	PublicURL(key string) string
}

type ReadableStore interface {
	Open(ctx context.Context, key string) (io.ReadCloser, error)
	Stat(ctx context.Context, key string) (ObjectInfo, error)
	OpenRange(ctx context.Context, key string, value ByteRange) (io.ReadCloser, error)
}

type ReadSeekCloser interface {
	Read(p []byte) (n int, err error)
	Seek(offset int64, whence int) (int64, error)
	Close() error
}

type Config struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

type Factory func(args any) (Store, error)

var (
	registryMu sync.RWMutex
	registry   = map[string]Factory{}
	fileKeyRE  = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)
)

func Register(name string, factory Factory) {
	key := strings.ToLower(strings.TrimSpace(name))
	if key == "" || factory == nil {
		return
	}
	registryMu.Lock()
	registry[key] = factory
	registryMu.Unlock()
}

func New(cfg Config) (Store, error) {
	key := strings.ToLower(strings.TrimSpace(cfg.Type))
	if key == "" {
		return nil, ErrStoreTypeRequired
	}
	registryMu.RLock()
	factory := registry[key]
	registryMu.RUnlock()
	if factory == nil {
		return nil, fmt.Errorf("%w: %s", ErrUnsupportedStore, cfg.Type)
	}
	return factory(cfg.Data)
}

func decodeConfig(args, dst any) error {
	if args == nil {
		return ErrConfigRequired
	}
	data, err := json.Marshal(args)
	if err != nil {
		return fmt.Errorf("encode store config: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		return fmt.Errorf("decode store config: %w", err)
	}
	return nil
}

func ValidateFileKey(key string) error {
	if key == "" || key == "." || key == ".." || !fileKeyRE.MatchString(key) {
		return ErrInvalidFileKey
	}
	return nil
}

func buildFileKey(generator idgen.Generator, userID, filename string) (string, error) {
	ext := strings.ToLower(filepath.Ext(filename))
	base, err := generator.Token(8)
	if err != nil {
		return "", fmt.Errorf("generate file key: %w", err)
	}
	if userID != "" {
		base = userID + "_" + base
	}
	if ext == "" {
		return base, nil
	}
	return base + ext, nil
}
