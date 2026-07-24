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

	"github.com/xxxsen/mnote/internal/pkg/idgen"
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
	key, err := buildFileKey(idgen.New(bytes.NewReader(bytes.Repeat([]byte{1}, 8))), "user1", "photo.jpg")
	require.NoError(t, err)
	assert.True(t, len(key) > 0)
	assert.Contains(t, key, "user1_")
	assert.True(t, filepath.Ext(key) == ".jpg")
}

func TestBuildFileKey_NoExt(t *testing.T) {
	key, err := buildFileKey(idgen.New(bytes.NewReader(bytes.Repeat([]byte{1}, 8))), "user1", "noext")
	require.NoError(t, err)
	assert.Contains(t, key, "user1_")
	assert.Equal(t, "", filepath.Ext(key))
}

func TestBuildFileKey_EmptyUser(t *testing.T) {
	key, err := buildFileKey(idgen.New(bytes.NewReader(bytes.Repeat([]byte{1}, 8))), "", "test.png")
	require.NoError(t, err)
	assert.NotContains(t, key, "_")
	assert.Equal(t, ".png", filepath.Ext(key))
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

func TestDecodeConfig_RejectsUnknownFields(t *testing.T) {
	var dst struct {
		Dir string `json:"dir"`
	}
	err := decodeConfig(map[string]any{
		"dir":       "/tmp/test",
		"directory": "/tmp/other",
	}, &dst)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "unknown field")
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
	assert.ErrorIs(t, err, ErrInvalidFileKey)
}

func TestLocalStore_Open_InvalidKey(t *testing.T) {
	store := &localStore{dir: t.TempDir()}
	_, err := store.Open(context.Background(), "sub/dir")
	assert.ErrorIs(t, err, ErrInvalidFileKey)
}

func TestLocalStore_Open_NotFound(t *testing.T) {
	store := &localStore{dir: t.TempDir()}
	_, err := store.Open(context.Background(), "nonexistent.txt")
	assert.ErrorIs(t, err, ErrObjectNotFound)
}

func TestLocalStore_GenerateFileRef(t *testing.T) {
	store := &localStore{dir: t.TempDir()}
	ref, err := store.GenerateFileRef("u1", "doc.pdf")
	require.NoError(t, err)
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
	assert.ErrorIs(t, err, ErrInvalidFileKey)
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
	assert.ErrorIs(t, err, ErrInvalidFileKey)
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
	ref, err := store.GenerateFileRef("u1", "file.txt")
	require.NoError(t, err)
	assert.NotContains(t, ref, "http://")
	assert.Contains(t, store.PublicURL(ref), "http://s3:9000/bucket/")
}

func TestValidateFileKey(t *testing.T) {
	for _, valid := range []string{"file.pdf", "user_123-file.mp4", ".hidden"} {
		assert.NoError(t, ValidateFileKey(valid))
	}
	for _, invalid := range []string{
		"", ".", "..", "../file", "folder/file", `folder\file`,
		"https://example.test/file", "file name.pdf", "file\r\nX-Test:value",
	} {
		assert.ErrorIs(t, ValidateFileKey(invalid), ErrInvalidFileKey)
	}
}

func TestLocalStore_StatAndOpenRange(t *testing.T) {
	store := &localStore{dir: t.TempDir()}
	data := []byte("0123456789")
	require.NoError(t, store.Save(
		context.Background(),
		"range.bin",
		&memReadSeekCloser{Reader: bytes.NewReader(data)},
		int64(len(data)),
	))

	info, err := store.Stat(context.Background(), "range.bin")
	require.NoError(t, err)
	assert.Equal(t, int64(len(data)), info.Size)

	body, err := store.OpenRange(
		context.Background(), "range.bin", ByteRange{Start: 2, End: 6},
	)
	require.NoError(t, err)
	content, err := io.ReadAll(body)
	require.NoError(t, err)
	assert.Equal(t, []byte("23456"), content)
	require.NoError(t, body.Close())

	section := body.(*sectionReadCloser)
	_, err = section.closer.(*os.File).Stat()
	assert.Error(t, err, "closing the range reader must close the underlying file")
}

func TestLocalStore_StatAndRangeErrors(t *testing.T) {
	store := &localStore{dir: t.TempDir()}

	_, err := store.Stat(context.Background(), "missing.pdf")
	assert.ErrorIs(t, err, ErrObjectNotFound)
	_, err = store.OpenRange(
		context.Background(), "missing.pdf", ByteRange{Start: 0, End: 0},
	)
	assert.ErrorIs(t, err, ErrObjectNotFound)
	_, err = store.OpenRange(
		context.Background(), "../escape", ByteRange{Start: 0, End: 0},
	)
	assert.ErrorIs(t, err, ErrInvalidFileKey)
	_, err = store.OpenRange(
		context.Background(), "file.pdf", ByteRange{Start: -1, End: 0},
	)
	assert.Error(t, err)
}
