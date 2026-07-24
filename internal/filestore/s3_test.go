package filestore

import (
	"bytes"
	"context"
	"errors"
	"io"
	"testing"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/smithy-go"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeS3API struct {
	putObjectFn    func(context.Context, *s3.PutObjectInput) (*s3.PutObjectOutput, error)
	getObjectFn    func(context.Context, *s3.GetObjectInput) (*s3.GetObjectOutput, error)
	headObjectFn   func(context.Context, *s3.HeadObjectInput) (*s3.HeadObjectOutput, error)
	deleteObjectFn func(context.Context, *s3.DeleteObjectInput) (*s3.DeleteObjectOutput, error)
}

type closeTrackingReader struct {
	io.Reader
	closed bool
}

func (r *closeTrackingReader) Close() error {
	r.closed = true
	return nil
}

func (f *fakeS3API) PutObject(
	ctx context.Context, input *s3.PutObjectInput, _ ...func(*s3.Options),
) (*s3.PutObjectOutput, error) {
	if f.putObjectFn == nil {
		panic("fakeS3API.PutObject not configured")
	}
	return f.putObjectFn(ctx, input)
}

func (f *fakeS3API) GetObject(
	ctx context.Context, input *s3.GetObjectInput, _ ...func(*s3.Options),
) (*s3.GetObjectOutput, error) {
	if f.getObjectFn == nil {
		panic("fakeS3API.GetObject not configured")
	}
	return f.getObjectFn(ctx, input)
}

func (f *fakeS3API) HeadObject(
	ctx context.Context, input *s3.HeadObjectInput, _ ...func(*s3.Options),
) (*s3.HeadObjectOutput, error) {
	if f.headObjectFn == nil {
		panic("fakeS3API.HeadObject not configured")
	}
	return f.headObjectFn(ctx, input)
}

func (f *fakeS3API) DeleteObject(
	ctx context.Context, input *s3.DeleteObjectInput, _ ...func(*s3.Options),
) (*s3.DeleteObjectOutput, error) {
	if f.deleteObjectFn == nil {
		panic("fakeS3API.DeleteObject not configured")
	}
	return f.deleteObjectFn(ctx, input)
}

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
		{"no_scheme_no_ssl", &s3Config{Endpoint: "s3.host.com", Bucket: "b"}, "http://s3.host.com/b"},
		{"with_prefix", &s3Config{Endpoint: "http://s3:9000", Bucket: "b", Prefix: "uploads"}, "http://s3:9000/b/uploads"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			assert.Equal(t, test.want, buildBaseURL(test.cfg))
		})
	}
}

func TestS3Store_ObjectKey(t *testing.T) {
	store := &s3Store{prefix: "uploads"}

	key, err := store.objectKey("file.txt")
	require.NoError(t, err)
	assert.Equal(t, "uploads/file.txt", key)

	for _, invalid := range []string{
		"", ".", "..", "uploads/file.txt", `folder\file.txt`,
		"http://s3:9000/bucket/file.txt", "name\r\nX-Test:value",
	} {
		t.Run(invalid, func(t *testing.T) {
			_, err := store.objectKey(invalid)
			assert.ErrorIs(t, err, ErrInvalidFileKey)
		})
	}
}

func TestS3Store_Save(t *testing.T) {
	var called bool
	client := &fakeS3API{
		putObjectFn: func(_ context.Context, input *s3.PutObjectInput) (*s3.PutObjectOutput, error) {
			called = true
			assert.Equal(t, "bucket", aws.ToString(input.Bucket))
			assert.Equal(t, "prefix/file.txt", aws.ToString(input.Key))
			assert.Equal(t, int64(4), aws.ToInt64(input.ContentLength))
			return &s3.PutObjectOutput{}, nil
		},
	}
	store := &s3Store{client: client, bucket: "bucket", prefix: "prefix"}
	reader := &memReadSeekCloser{Reader: bytes.NewReader([]byte("data"))}

	require.NoError(t, store.Save(context.Background(), "file.txt", reader, 4))
	assert.True(t, called)

	called = false
	err := store.Save(context.Background(), "https://evil.test/file.txt", reader, 4)
	assert.ErrorIs(t, err, ErrInvalidFileKey)
	assert.False(t, called)
}

func TestS3Store_StatAndOpenRange(t *testing.T) {
	responseBody := &closeTrackingReader{
		Reader: bytes.NewReader(bytes.Repeat([]byte{'x'}, 100)),
	}
	client := &fakeS3API{
		headObjectFn: func(ctx context.Context, input *s3.HeadObjectInput) (*s3.HeadObjectOutput, error) {
			assert.NoError(t, ctx.Err())
			assert.Equal(t, "prefix/media.mp4", aws.ToString(input.Key))
			return &s3.HeadObjectOutput{ContentLength: aws.Int64(1024)}, nil
		},
		getObjectFn: func(ctx context.Context, input *s3.GetObjectInput) (*s3.GetObjectOutput, error) {
			assert.NoError(t, ctx.Err())
			assert.Equal(t, "bytes=100-199", aws.ToString(input.Range))
			return &s3.GetObjectOutput{
				Body: responseBody,
			}, nil
		},
	}
	store := &s3Store{client: client, bucket: "bucket", prefix: "prefix"}

	info, err := store.Stat(context.Background(), "media.mp4")
	require.NoError(t, err)
	assert.Equal(t, int64(1024), info.Size)

	body, err := store.OpenRange(
		context.Background(), "media.mp4", ByteRange{Start: 100, End: 199},
	)
	require.NoError(t, err)
	data, err := io.ReadAll(body)
	require.NoError(t, err)
	assert.Len(t, data, 100)
	require.NoError(t, body.Close())
	assert.True(t, responseBody.closed)
}

func TestS3Store_OpenAndDelete(t *testing.T) {
	client := &fakeS3API{
		getObjectFn: func(_ context.Context, input *s3.GetObjectInput) (*s3.GetObjectOutput, error) {
			assert.Nil(t, input.Range)
			return &s3.GetObjectOutput{
				Body: io.NopCloser(bytes.NewReader([]byte("data"))),
			}, nil
		},
		deleteObjectFn: func(_ context.Context, input *s3.DeleteObjectInput) (*s3.DeleteObjectOutput, error) {
			assert.Equal(t, "file.txt", aws.ToString(input.Key))
			return &s3.DeleteObjectOutput{}, nil
		},
	}
	store := &s3Store{client: client, bucket: "bucket"}

	body, err := store.Open(context.Background(), "file.txt")
	require.NoError(t, err)
	_ = body.Close()
	require.NoError(t, store.Delete(context.Background(), "file.txt"))
}

func TestS3Store_NormalizesNotFound(t *testing.T) {
	notFound := &smithy.GenericAPIError{Code: "NotFound", Message: "internal provider detail"}
	client := &fakeS3API{
		headObjectFn: func(context.Context, *s3.HeadObjectInput) (*s3.HeadObjectOutput, error) {
			return nil, notFound
		},
		getObjectFn: func(context.Context, *s3.GetObjectInput) (*s3.GetObjectOutput, error) {
			return nil, notFound
		},
	}
	store := &s3Store{client: client, bucket: "bucket"}

	_, err := store.Stat(context.Background(), "missing.pdf")
	assert.ErrorIs(t, err, ErrObjectNotFound)
	_, err = store.Open(context.Background(), "missing.pdf")
	assert.ErrorIs(t, err, ErrObjectNotFound)
	_, err = store.OpenRange(
		context.Background(), "missing.pdf", ByteRange{Start: 0, End: 0},
	)
	assert.ErrorIs(t, err, ErrObjectNotFound)
}

func TestS3Store_RejectsInvalidInputsBeforeSDK(t *testing.T) {
	client := &fakeS3API{
		getObjectFn: func(context.Context, *s3.GetObjectInput) (*s3.GetObjectOutput, error) {
			t.Fatal("GetObject must not be called")
			return nil, nil
		},
		headObjectFn: func(context.Context, *s3.HeadObjectInput) (*s3.HeadObjectOutput, error) {
			t.Fatal("HeadObject must not be called")
			return nil, nil
		},
		deleteObjectFn: func(context.Context, *s3.DeleteObjectInput) (*s3.DeleteObjectOutput, error) {
			t.Fatal("DeleteObject must not be called")
			return nil, nil
		},
	}
	store := &s3Store{client: client, bucket: "bucket"}

	for _, invalid := range []string{"../file", `folder\file`, "https://evil.test/file"} {
		_, err := store.Open(context.Background(), invalid)
		assert.ErrorIs(t, err, ErrInvalidFileKey)
		_, err = store.Stat(context.Background(), invalid)
		assert.ErrorIs(t, err, ErrInvalidFileKey)
		_, err = store.OpenRange(
			context.Background(), invalid, ByteRange{Start: 0, End: 0},
		)
		assert.ErrorIs(t, err, ErrInvalidFileKey)
		err = store.Delete(context.Background(), invalid)
		assert.ErrorIs(t, err, ErrInvalidFileKey)
	}
}

func TestS3Store_ProviderFailuresRemainWrapped(t *testing.T) {
	providerErr := errors.New("provider unavailable")
	client := &fakeS3API{
		headObjectFn: func(context.Context, *s3.HeadObjectInput) (*s3.HeadObjectOutput, error) {
			return nil, providerErr
		},
	}
	store := &s3Store{client: client, bucket: "bucket"}

	_, err := store.Stat(context.Background(), "file.pdf")
	assert.ErrorIs(t, err, providerErr)
	assert.NotErrorIs(t, err, ErrObjectNotFound)
}

func TestS3Store_GenerateFileRefAndPublicURL(t *testing.T) {
	store := &s3Store{prefix: "uploads", baseURL: "http://s3:9000/bucket/uploads"}
	ref, err := store.GenerateFileRef("user1", "doc.pdf")
	require.NoError(t, err)
	assert.NotContains(t, ref, "uploads/")
	assert.NotContains(t, ref, "http")
	assert.Equal(t, "http://s3:9000/bucket/uploads/"+ref, store.PublicURL(ref))
}

func TestCreateS3Store(t *testing.T) {
	_, err := createS3Store(nil)
	assert.Error(t, err)
	_, err = createS3Store(map[string]any{"endpoint": "e"})
	assert.ErrorIs(t, err, errS3ConfigRequired)

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
