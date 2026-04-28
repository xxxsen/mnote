package handler

import (
	"bytes"
	"io"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
)

func TestIsEmailValid(t *testing.T) {
	assert.True(t, isEmailValid("user@example.com"))
	assert.False(t, isEmailValid("noat"))
	assert.False(t, isEmailValid("a@b@c"))
	assert.False(t, isEmailValid(""))
}

func TestResolveContentType(t *testing.T) {
	assert.Equal(t, "image/png", resolveContentType("application/octet-stream", "photo.png"))
	assert.Equal(t, "text/plain", resolveContentType("text/plain", "file.txt"))
	assert.Equal(t, "application/octet-stream", resolveContentType("application/octet-stream", "file.xyz"))
}

func TestResolveFileURL(t *testing.T) {
	assert.Equal(t, "/api/v1/files/abc", resolveFileURL("abc"))
	assert.Equal(t, "https://cdn.example.com/f", resolveFileURL("https://cdn.example.com/f"))
	assert.Equal(t, "http://localhost/f", resolveFileURL("http://localhost/f"))
}

func TestFallbackContentType(t *testing.T) {
	assert.Equal(t, "application/octet-stream", fallbackContentType(""))
	assert.Equal(t, "text/html", fallbackContentType("text/html"))
}

func TestDetectContentType_ByExtension(t *testing.T) {
	ct := detectContentType("photo.png", io.NopCloser(bytes.NewReader(nil)))
	assert.Equal(t, "image/png", ct)
}

func TestDetectContentType_UnknownExt(t *testing.T) {
	ct := detectContentType("file.xyz", io.NopCloser(bytes.NewReader(nil)))
	assert.Equal(t, "application/octet-stream", ct)
}

func TestDetectContentType_Seekable(t *testing.T) {
	pngHeader := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
	data := make([]byte, 512)
	copy(data, pngHeader)
	ct := detectContentType("file.bin", readSeekNopCloser(data))
	assert.Equal(t, "image/png", ct)
}

func TestCollectUniqueTagIDs(t *testing.T) {
	tagMap := map[string][]string{
		"d1": {"t1", "t2"},
		"d2": {"t2", "t3"},
	}
	ids := collectUniqueTagIDs(tagMap)
	assert.Len(t, ids, 3)
}

func TestCollectUniqueTagIDs_Empty(t *testing.T) {
	assert.Empty(t, collectUniqueTagIDs(nil))
	assert.Empty(t, collectUniqueTagIDs(map[string][]string{}))
}

func TestBuildListItems(t *testing.T) {
	docs := []model.Document{
		{ID: "d1", Title: "Doc1"},
		{ID: "d2", Title: "Doc2"},
	}
	tagMap := map[string][]string{
		"d1": {"t1"},
	}
	items := buildListItems(docs, tagMap, nil, false)
	assert.Len(t, items, 2)
	assert.Equal(t, []string{"t1"}, items[0].TagIDs)
	assert.Equal(t, []string{}, items[1].TagIDs)
	assert.Nil(t, items[0].Tags)
}

func TestBuildListItems_WithTags(t *testing.T) {
	docs := []model.Document{
		{ID: "d1", Title: "Doc1"},
	}
	tagMap := map[string][]string{
		"d1": {"t1", "t2"},
	}
	tagIndex := map[string]model.Tag{
		"t1": {ID: "t1", Name: "Go"},
		"t2": {ID: "t2", Name: "Rust"},
	}
	items := buildListItems(docs, tagMap, tagIndex, true)
	assert.Len(t, items[0].Tags, 2)
}

func TestRemoveFile(t *testing.T) {
	err := removeFile("/nonexistent/file/path")
	assert.Error(t, err)
}

// readSeekNopCloser wraps a byte slice as ReadSeekCloser.
type readSeekNopCloserImpl struct {
	*bytes.Reader
}

func (r *readSeekNopCloserImpl) Close() error { return nil }

func readSeekNopCloser(data []byte) io.ReadCloser {
	return &readSeekNopCloserImpl{bytes.NewReader(data)}
}

func TestEnsureReadSeekCloser(t *testing.T) {
	data := []byte("hello world")
	rsc := &readSeekNopCloserImpl{bytes.NewReader(data)}
	result, ct, err := ensureReadSeekCloser(rsc)
	require.NoError(t, err)
	assert.NotEmpty(t, ct)
	all, _ := io.ReadAll(result)
	assert.Equal(t, data, all)
}

func TestFormatUploadLimit(t *testing.T) {
	assert.Equal(t, "0MB", formatUploadLimit(0))
	assert.Equal(t, "0MB", formatUploadLimit(-1))
	assert.Equal(t, "1MB", formatUploadLimit(100))
	assert.Equal(t, "1MB", formatUploadLimit(1024*1024))
	assert.Equal(t, "20MB", formatUploadLimit(20*1024*1024))
}

func TestMapOAuthError(t *testing.T) {
	assert.Equal(t, "internal", mapOAuthError(nil))
	assert.Equal(t, "internal", mapOAuthError(assert.AnError))
}

func TestOAuthStateStore(t *testing.T) {
	store := newOAuthStateStore()
	state := store.Create("github", "login", "", "/")
	assert.NotEmpty(t, state)

	item, ok := store.Consume(state)
	assert.True(t, ok)
	assert.Equal(t, "github", item.Provider)
	assert.Equal(t, "login", item.Mode)

	_, ok = store.Consume(state)
	assert.False(t, ok, "should not consume twice")
}

func TestOAuthStateStore_Unknown(t *testing.T) {
	store := newOAuthStateStore()
	_, ok := store.Consume("nonexistent")
	assert.False(t, ok)
}

func TestOAuthExchangeStore(t *testing.T) {
	store := newOAuthExchangeStore()
	code := store.Create("jwt-token", "user@example.com")
	assert.NotEmpty(t, code)

	item, ok := store.Consume(code)
	assert.True(t, ok)
	assert.Equal(t, "jwt-token", item.Token)
	assert.Equal(t, "user@example.com", item.Email)

	_, ok = store.Consume(code)
	assert.False(t, ok, "should not consume twice")
}

func TestOAuthExchangeStore_Unknown(t *testing.T) {
	store := newOAuthExchangeStore()
	_, ok := store.Consume("nonexistent")
	assert.False(t, ok)
}

func TestRandomState(t *testing.T) {
	s := randomState()
	assert.Len(t, s, 32)
	s2 := randomState()
	assert.NotEqual(t, s, s2)
}

func TestRemoveFile_EmptyPath(t *testing.T) {
	assert.NoError(t, removeFile(""))
}
