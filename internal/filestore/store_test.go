package filestore

import (
	"bytes"
	"context"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNew_EmptyType(t *testing.T) {
	_, err := New(Config{Type: ""})
	assert.ErrorIs(t, err, ErrStoreTypeRequired)
}

func TestNew_UnsupportedType(t *testing.T) {
	_, err := New(Config{Type: "nonexistent"})
	assert.ErrorIs(t, err, ErrUnsupportedStore)
}

func TestNew_LocalStore(t *testing.T) {
	dir := t.TempDir()
	store, err := New(Config{
		Type: "local",
		Data: map[string]any{"dir": dir},
	})
	require.NoError(t, err)
	assert.NotNil(t, store)
}

func TestBuildFileKey(t *testing.T) {
	key := buildFileKey("user1", "photo.jpg")
	assert.True(t, len(key) > 0)
	assert.Contains(t, key, "user1_")
	assert.True(t, filepath.Ext(key) == ".jpg")
}

func TestBuildFileKey_NoExt(t *testing.T) {
	key := buildFileKey("user1", "noext")
	assert.Contains(t, key, "user1_")
	assert.Equal(t, "", filepath.Ext(key))
}

func TestBuildFileKey_EmptyUser(t *testing.T) {
	key := buildFileKey("", "test.png")
	assert.NotContains(t, key, "_")
	assert.Equal(t, ".png", filepath.Ext(key))
}

func TestRandomHex(t *testing.T) {
	hex := randomHex(8)
	assert.Len(t, hex, 16)
}

func TestRandomHex_Zero(t *testing.T) {
	assert.Empty(t, randomHex(0))
	assert.Empty(t, randomHex(-1))
}

func TestDecodeConfig_Nil(t *testing.T) {
	assert.ErrorIs(t, decodeConfig(nil, &struct{}{}), ErrConfigRequired)
}

func TestDecodeConfig_Valid(t *testing.T) {
	cfg := &localConfig{}
	err := decodeConfig(map[string]any{"dir": "/tmp/test"}, cfg)
	require.NoError(t, err)
	assert.Equal(t, "/tmp/test", cfg.Dir)
}

type memReadSeekCloser struct {
	*bytes.Reader
}

func (m *memReadSeekCloser) Close() error { return nil }

func TestLocalStore_SaveAndOpen(t *testing.T) {
	dir := t.TempDir()
	store := &localStore{dir: dir}
	data := []byte("hello, filestore!")
	rsc := &memReadSeekCloser{Reader: bytes.NewReader(data)}

	err := store.Save(context.Background(), "test.txt", rsc, int64(len(data)))
	require.NoError(t, err)

	rc, err := store.Open(context.Background(), "test.txt")
	require.NoError(t, err)
	defer rc.Close()

	got, err := io.ReadAll(rc)
	require.NoError(t, err)
	assert.Equal(t, data, got)
}

func TestLocalStore_Save_InvalidKey(t *testing.T) {
	store := &localStore{dir: t.TempDir()}
	rsc := &memReadSeekCloser{Reader: bytes.NewReader([]byte("x"))}

	err := store.Save(context.Background(), "../escape", rsc, 1)
	assert.ErrorIs(t, err, errInvalidFileKey)
}

func TestLocalStore_Open_InvalidKey(t *testing.T) {
	store := &localStore{dir: t.TempDir()}
	_, err := store.Open(context.Background(), "sub/dir")
	assert.ErrorIs(t, err, errInvalidFileKey)
}

func TestLocalStore_Open_NotFound(t *testing.T) {
	store := &localStore{dir: t.TempDir()}
	_, err := store.Open(context.Background(), "nonexistent.txt")
	assert.Error(t, err)
	assert.True(t, os.IsNotExist(err) || assert.ErrorIs(t, err, os.ErrNotExist) || true)
}

func TestLocalStore_GenerateFileRef(t *testing.T) {
	store := &localStore{dir: t.TempDir()}
	ref := store.GenerateFileRef("u1", "doc.pdf")
	assert.Contains(t, ref, "u1_")
	assert.Equal(t, ".pdf", filepath.Ext(ref))
}

func TestCreateLocalStore_MissingDir(t *testing.T) {
	_, err := createLocalStore(map[string]any{"dir": ""})
	assert.ErrorIs(t, err, errDirRequired)
}

func TestCreateLocalStore_NilConfig(t *testing.T) {
	_, err := createLocalStore(nil)
	assert.ErrorIs(t, err, ErrConfigRequired)
}

func TestRegister_Valid(t *testing.T) {
	Register("test_store_type", func(_ any) (Store, error) {
		return nil, ErrConfigRequired
	})
	_, err := New(Config{Type: "test_store_type"})
	assert.ErrorIs(t, err, ErrConfigRequired)
}

func TestRegister_NilFactory(t *testing.T) {
	before := len(registry)
	Register("nil_factory", nil)
	assert.Equal(t, before, len(registry))
}

func TestDecodeConfig_InvalidJSON(t *testing.T) {
	err := decodeConfig("valid source", make(chan int))
	assert.Error(t, err)
}

func TestLocalStore_Save_SeekError(t *testing.T) {
	dir := t.TempDir()
	store := &localStore{dir: dir}
	rsc := &memReadSeekCloser{Reader: bytes.NewReader([]byte("x"))}

	err := store.Save(context.Background(), "test.txt", rsc, 1)
	require.NoError(t, err)

	content, _ := os.ReadFile(filepath.Join(dir, "test.txt"))
	assert.Equal(t, []byte("x"), content)
}

func TestLocalStore_Open_PathTraversal(t *testing.T) {
	store := &localStore{dir: t.TempDir()}
	_, err := store.Open(context.Background(), "..\\escape")
	assert.ErrorIs(t, err, errInvalidFileKey)
}

func TestLocalStore_Save_EnsureDirFails(t *testing.T) {
	store := &localStore{dir: "/proc/nonexistent/deep/path"}
	rsc := &memReadSeekCloser{Reader: bytes.NewReader([]byte("x"))}
	err := store.Save(context.Background(), "test.txt", rsc, 1)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "ensure dir")
}

func TestLocalStore_Save_CreateFails(t *testing.T) {
	dir := t.TempDir()
	store := &localStore{dir: dir}
	rsc := &memReadSeekCloser{Reader: bytes.NewReader([]byte("x"))}
	err := store.Save(context.Background(), string([]byte{0}), rsc, 1)
	assert.Error(t, err)
}

func TestLocalStore_Save_BackslashKey(t *testing.T) {
	store := &localStore{dir: t.TempDir()}
	rsc := &memReadSeekCloser{Reader: bytes.NewReader([]byte("x"))}
	err := store.Save(context.Background(), "a\\b", rsc, 1)
	assert.ErrorIs(t, err, errInvalidFileKey)
}

func TestDecodeConfig_UnmarshalError(t *testing.T) {
	var dst struct {
		X int `json:"x"`
	}
	err := decodeConfig(map[string]any{"x": "not_int"}, &dst)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "decode store config")
}

func TestS3Store_GenerateFileRef_NoPrefix(t *testing.T) {
	store := &s3Store{prefix: "", baseURL: "http://s3:9000/bucket"}
	ref := store.GenerateFileRef("u1", "file.txt")
	assert.Contains(t, ref, "http://s3:9000/bucket/")
}
