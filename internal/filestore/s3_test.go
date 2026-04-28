package filestore

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBuildBaseURL(t *testing.T) {
	tests := []struct {
		name string
		cfg  *s3Config
		want string
	}{
		{"empty_endpoint", &s3Config{Endpoint: "", Bucket: "b"}, ""},
		{"empty_bucket", &s3Config{Endpoint: "e", Bucket: ""}, ""},
		{"http_prefix", &s3Config{Endpoint: "http://minio:9000", Bucket: "files"}, "http://minio:9000/files"},
		{"https_prefix", &s3Config{Endpoint: "https://s3.aws.com", Bucket: "b"}, "https://s3.aws.com/b"},
		{"no_scheme_ssl", &s3Config{Endpoint: "s3.host.com", Bucket: "b", UseSSL: true}, "https://s3.host.com/b"},
		{"no_scheme_no_ssl", &s3Config{Endpoint: "s3.host.com", Bucket: "b", UseSSL: false}, "http://s3.host.com/b"},
		{"with_prefix", &s3Config{Endpoint: "http://s3:9000", Bucket: "b", Prefix: "uploads"}, "http://s3:9000/b/uploads"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, buildBaseURL(tt.cfg))
		})
	}
}

func TestS3Store_ObjectKey_Plain(t *testing.T) {
	store := &s3Store{prefix: "uploads", baseURL: ""}
	key, err := store.objectKey("file.txt")
	require.NoError(t, err)
	assert.Equal(t, "uploads/file.txt", key)
}

func TestS3Store_ObjectKey_AlreadyPrefixed(t *testing.T) {
	store := &s3Store{prefix: "uploads", baseURL: ""}
	key, err := store.objectKey("uploads/file.txt")
	require.NoError(t, err)
	assert.Equal(t, "uploads/file.txt", key)
}

func TestS3Store_ObjectKey_URL(t *testing.T) {
	store := &s3Store{prefix: "uploads", baseURL: "http://s3:9000/bucket"}
	key, err := store.objectKey("http://s3:9000/bucket/uploads/file.txt")
	require.NoError(t, err)
	assert.Equal(t, "uploads/file.txt", key)
}

func TestS3Store_StripBasePath_NoBaseURL(t *testing.T) {
	store := &s3Store{baseURL: ""}
	assert.Equal(t, "file.txt", store.stripBasePath("file.txt"))
}

func TestS3Store_StripBasePath_WithBaseURL(t *testing.T) {
	store := &s3Store{baseURL: "http://s3:9000/bucket"}
	assert.Equal(t, "file.txt", store.stripBasePath("bucket/file.txt"))
}

func TestS3Store_StripBasePath_NoMatch(t *testing.T) {
	store := &s3Store{baseURL: "http://s3:9000/bucket"}
	assert.Equal(t, "other/file.txt", store.stripBasePath("other/file.txt"))
}

func TestS3Store_ApplyPrefix(t *testing.T) {
	store := &s3Store{prefix: "data"}
	assert.Equal(t, "data/file.txt", store.applyPrefix("file.txt"))
}

func TestS3Store_ApplyPrefix_AlreadyPrefixed(t *testing.T) {
	store := &s3Store{prefix: "data"}
	assert.Equal(t, "data/file.txt", store.applyPrefix("data/file.txt"))
}

func TestS3Store_ApplyPrefix_NoPrefix(t *testing.T) {
	store := &s3Store{prefix: ""}
	assert.Equal(t, "file.txt", store.applyPrefix("file.txt"))
}

func TestS3Store_GenerateFileRef_WithPrefix(t *testing.T) {
	store := &s3Store{prefix: "uploads", baseURL: "http://s3:9000/bucket"}
	ref := store.GenerateFileRef("user1", "doc.pdf")
	assert.Contains(t, ref, "http://s3:9000/bucket/")
	assert.Contains(t, ref, "uploads/")
}

func TestS3Store_GenerateFileRef_NoBaseURL(t *testing.T) {
	store := &s3Store{prefix: "uploads", baseURL: ""}
	ref := store.GenerateFileRef("user1", "doc.pdf")
	assert.Contains(t, ref, "uploads/")
	assert.NotContains(t, ref, "http")
}

func TestCreateS3Store_NilConfig(t *testing.T) {
	_, err := createS3Store(nil)
	assert.Error(t, err)
}

func TestCreateS3Store_MissingRequired(t *testing.T) {
	_, err := createS3Store(map[string]any{"endpoint": "e"})
	assert.ErrorIs(t, err, errS3ConfigRequired)
}

func TestCreateS3Store_Success(t *testing.T) {
	store, err := createS3Store(map[string]any{
		"endpoint":   "http://minio:9000",
		"bucket":     "test-bucket",
		"secret_id":  "minioadmin",
		"secret_key": "minioadmin",
		"prefix":     "uploads",
	})
	require.NoError(t, err)
	assert.NotNil(t, store)
}

func TestCreateS3Store_DefaultRegion(t *testing.T) {
	store, err := createS3Store(map[string]any{
		"endpoint":   "http://s3:9000",
		"bucket":     "b",
		"secret_id":  "id",
		"secret_key": "key",
	})
	require.NoError(t, err)
	assert.NotNil(t, store)
}

func TestCreateS3Store_SSLEndpoint(t *testing.T) {
	store, err := createS3Store(map[string]any{
		"endpoint":   "s3.example.com",
		"bucket":     "b",
		"secret_id":  "id",
		"secret_key": "key",
		"use_ssl":    true,
	})
	require.NoError(t, err)
	assert.NotNil(t, store)
}

func TestCreateS3Store_NoSSLEndpoint(t *testing.T) {
	store, err := createS3Store(map[string]any{
		"endpoint":   "s3.example.com",
		"bucket":     "b",
		"secret_id":  "id",
		"secret_key": "key",
		"use_ssl":    false,
	})
	require.NoError(t, err)
	assert.NotNil(t, store)
}

func TestS3Store_Save_EmptyKey(t *testing.T) {
	store := &s3Store{bucket: "b", prefix: ""}
	err := store.Save(context.Background(), "", nil, 0)
	assert.ErrorIs(t, err, errFileKeyRequired)
}

func TestS3Store_ObjectKey_URLParseError(t *testing.T) {
	store := &s3Store{prefix: "p", baseURL: "http://s3:9000/bucket"}
	key, err := store.objectKey("http://s3:9000/bucket/p/file.txt")
	require.NoError(t, err)
	assert.Equal(t, "p/file.txt", key)
}

func TestS3Store_ObjectKey_NoPrefix(t *testing.T) {
	store := &s3Store{prefix: "", baseURL: ""}
	key, err := store.objectKey("file.txt")
	require.NoError(t, err)
	assert.Equal(t, "file.txt", key)
}

func TestS3Store_StripBasePath_InvalidBaseURL(t *testing.T) {
	store := &s3Store{baseURL: "://invalid"}
	result := store.stripBasePath("some/path")
	assert.Equal(t, "some/path", result)
}
