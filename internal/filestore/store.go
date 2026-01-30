package filestore

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"sync"

	"github.com/xxxsen/mnote/internal/config"
)

type Store interface {
	Save(ctx context.Context, key string, r ReadSeekCloser, size int64) error
	Open(ctx context.Context, key string) (io.ReadCloser, error)
	GenerateFileRef(userID, filename string) string
}

type ReadSeekCloser interface {
	Read(p []byte) (n int, err error)
	Seek(offset int64, whence int) (int64, error)
	Close() error
}

type Factory func(args interface{}) (Store, error)

var (
	registryMu sync.RWMutex
	registry   = map[string]Factory{}
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

func New(cfg config.FileStoreConfig) (Store, error) {
	key := strings.ToLower(strings.TrimSpace(cfg.Type))
	if key == "" {
		return nil, fmt.Errorf("file_store.type is required")
	}
	registryMu.RLock()
	factory := registry[key]
	registryMu.RUnlock()
	if factory == nil {
		return nil, fmt.Errorf("unsupported file store type: %s", cfg.Type)
	}
	return factory(cfg.Data)
}

func decodeConfig(args interface{}, dst interface{}) error {
	if args == nil {
		return fmt.Errorf("store config is required")
	}
	data, err := json.Marshal(args)
	if err != nil {
		return fmt.Errorf("encode store config: %w", err)
	}
	if err := json.Unmarshal(data, dst); err != nil {
		return fmt.Errorf("decode store config: %w", err)
	}
	return nil
}

func buildFileKey(userID, filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	base := randomHex(8)
	if userID != "" {
		base = userID + "_" + base
	}
	if ext == "" {
		return base
	}
	return base + ext
}

func randomHex(size int) string {
	if size <= 0 {
		return ""
	}
	buf := make([]byte, size)
	_, err := rand.Read(buf)
	if err != nil {
		return ""
	}
	return hex.EncodeToString(buf)
}
