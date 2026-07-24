package handler

import (
	"bytes"
	"context"
	"errors"
	"io"
	"math"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/filestore"
)

func previewStore(data []byte) *mockFileStore {
	return &mockFileStore{
		statFn: func(_ context.Context, _ string) (filestore.ObjectInfo, error) {
			return filestore.ObjectInfo{Size: int64(len(data))}, nil
		},
		openFn: func(_ context.Context, _ string) (io.ReadCloser, error) {
			return io.NopCloser(bytes.NewReader(data)), nil
		},
		openRangeFn: func(
			_ context.Context, _ string, value filestore.ByteRange,
		) (io.ReadCloser, error) {
			return io.NopCloser(bytes.NewReader(data[value.Start : value.End+1])), nil
		},
	}
}

func previewRequest(
	t *testing.T,
	store *mockFileStore,
	method, key, rangeValue string,
) *httptest.ResponseRecorder {
	t.Helper()
	router := newTestRouter()
	handler := &FileHandler{store: store}
	router.HEAD("/files/:key/preview", handler.Preview)
	router.GET("/files/:key/preview", handler.Preview)
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(method, "/files/"+key+"/preview", nil)
	if rangeValue != "" {
		request.Header.Set("Range", rangeValue)
	}
	router.ServeHTTP(recorder, request)
	return recorder
}

func TestFileHandler_PreviewPDF(t *testing.T) {
	data := []byte("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF")
	recorder := previewRequest(t, previewStore(data), http.MethodGet, "manual.pdf", "")

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, data, recorder.Body.Bytes())
	assert.Equal(t, "application/pdf", recorder.Header().Get("Content-Type"))
	assert.Equal(t, "bytes", recorder.Header().Get("Accept-Ranges"))
	assert.Equal(t, "nosniff", recorder.Header().Get("X-Content-Type-Options"))
	assert.Equal(t, "private, no-transform", recorder.Header().Get("Cache-Control"))
	assert.Equal(t, pdfSecurityPolicy, recorder.Header().Get("Content-Security-Policy"))
	assert.Equal(t, `attachment; filename="manual.pdf"`, recorder.Header().Get("Content-Disposition"))
	assert.Equal(t, "34", recorder.Header().Get("Content-Length"))
}

func TestFileHandler_PreviewMediaRange(t *testing.T) {
	data := bytes.Repeat([]byte{0}, 1024)
	recorder := previewRequest(
		t, previewStore(data), http.MethodGet, "movie.mp4", "bytes=100-199",
	)

	require.Equal(t, http.StatusPartialContent, recorder.Code)
	assert.Len(t, recorder.Body.Bytes(), 100)
	assert.Equal(t, "video/mp4", recorder.Header().Get("Content-Type"))
	assert.Equal(t, `inline; filename="movie.mp4"`, recorder.Header().Get("Content-Disposition"))
	assert.Equal(t, "bytes 100-199/1024", recorder.Header().Get("Content-Range"))
	assert.Equal(t, "100", recorder.Header().Get("Content-Length"))
	assert.Empty(t, recorder.Header().Get("Content-Security-Policy"))
}

func TestFileHandler_PreviewHEADIgnoresRange(t *testing.T) {
	data := bytes.Repeat([]byte{0}, 64)
	recorder := previewRequest(
		t, previewStore(data), http.MethodHead, "audio.mp3", "bytes=10-20",
	)

	require.Equal(t, http.StatusOK, recorder.Code)
	assert.Empty(t, recorder.Body.Bytes())
	assert.Equal(t, "64", recorder.Header().Get("Content-Length"))
	assert.Empty(t, recorder.Header().Get("Content-Range"))
	assert.Equal(t, "audio/mpeg", recorder.Header().Get("Content-Type"))
}

func TestFileHandler_PreviewRejectsUnsupportedAndSpoofedTypes(t *testing.T) {
	tests := []struct {
		key  string
		data []byte
	}{
		{key: "page.pdf", data: []byte("<!doctype html><title>unsafe</title>")},
		{key: "image.pdf", data: []byte("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>")},
		{key: "binary.pdf", data: bytes.Repeat([]byte{0}, 32)},
		{key: "archive.zip", data: []byte("PK\x03\x04archive")},
		{key: "notes.txt", data: []byte("plain text")},
	}
	for _, test := range tests {
		t.Run(test.key, func(t *testing.T) {
			recorder := previewRequest(
				t, previewStore(test.data), http.MethodGet, test.key, "",
			)
			assert.Equal(t, http.StatusUnsupportedMediaType, recorder.Code)
			assert.Empty(t, recorder.Body.Bytes())
		})
	}
}

func TestFileHandler_PreviewNormalizesOggByExtension(t *testing.T) {
	data := append([]byte("OggS"), bytes.Repeat([]byte{0}, 32)...)

	video := previewRequest(t, previewStore(data), http.MethodHead, "clip.ogv", "")
	assert.Equal(t, "video/ogg", video.Header().Get("Content-Type"))

	audio := previewRequest(t, previewStore(data), http.MethodHead, "clip.ogg", "")
	assert.Equal(t, "audio/ogg", audio.Header().Get("Content-Type"))

	unsupported := previewRequest(t, previewStore(data), http.MethodHead, "clip.bin", "")
	assert.Equal(t, http.StatusUnsupportedMediaType, unsupported.Code)
}

func TestFileHandler_PreviewStatusMapping(t *testing.T) {
	t.Run("invalid_key", func(t *testing.T) {
		recorder := previewRequest(
			t, &mockFileStore{}, http.MethodGet, "bad%20key.pdf", "",
		)
		assert.Equal(t, http.StatusBadRequest, recorder.Code)
	})
	t.Run("not_found", func(t *testing.T) {
		store := &mockFileStore{
			statFn: func(context.Context, string) (filestore.ObjectInfo, error) {
				return filestore.ObjectInfo{}, filestore.ErrObjectNotFound
			},
		}
		recorder := previewRequest(t, store, http.MethodGet, "missing.pdf", "")
		assert.Equal(t, http.StatusNotFound, recorder.Code)
	})
	t.Run("provider_failure", func(t *testing.T) {
		store := &mockFileStore{
			statFn: func(context.Context, string) (filestore.ObjectInfo, error) {
				return filestore.ObjectInfo{}, errors.New("provider unavailable")
			},
		}
		recorder := previewRequest(t, store, http.MethodGet, "file.pdf", "")
		assert.Equal(t, http.StatusInternalServerError, recorder.Code)
		assert.Empty(t, recorder.Body.Bytes())
	})
	t.Run("empty_object", func(t *testing.T) {
		recorder := previewRequest(
			t, previewStore(nil), http.MethodGet, "empty.pdf", "",
		)
		assert.Equal(t, http.StatusUnsupportedMediaType, recorder.Code)
	})
}

func TestFileHandler_PreviewPDFSizeLimit(t *testing.T) {
	var openCalled bool
	var rangeCalls int
	header := []byte("%PDF-1.7\n")
	store := &mockFileStore{
		statFn: func(context.Context, string) (filestore.ObjectInfo, error) {
			return filestore.ObjectInfo{Size: maxPDFPreviewBytes + 1}, nil
		},
		openFn: func(context.Context, string) (io.ReadCloser, error) {
			openCalled = true
			return nil, errors.New("must not open full object")
		},
		openRangeFn: func(
			_ context.Context, _ string, value filestore.ByteRange,
		) (io.ReadCloser, error) {
			rangeCalls++
			data := make([]byte, value.End-value.Start+1)
			copy(data, header)
			return io.NopCloser(bytes.NewReader(data)), nil
		},
	}

	for _, request := range []struct {
		method     string
		rangeValue string
	}{
		{method: http.MethodHead},
		{method: http.MethodGet},
		{method: http.MethodGet, rangeValue: "bytes=0-10"},
	} {
		recorder := previewRequest(
			t, store, request.method, "large.pdf", request.rangeValue,
		)
		assert.Equal(t, http.StatusRequestEntityTooLarge, recorder.Code)
		assert.Empty(t, recorder.Body.Bytes())
	}
	assert.False(t, openCalled)
	assert.Equal(t, 3, rangeCalls, "only the 512-byte MIME probe may open a range")
}

func TestFileHandler_PreviewPDFExactSizeLimitIsAllowed(t *testing.T) {
	header := []byte("%PDF-1.7\n")
	store := &mockFileStore{
		statFn: func(context.Context, string) (filestore.ObjectInfo, error) {
			return filestore.ObjectInfo{Size: maxPDFPreviewBytes}, nil
		},
		openRangeFn: func(
			_ context.Context, _ string, value filestore.ByteRange,
		) (io.ReadCloser, error) {
			data := make([]byte, value.End-value.Start+1)
			copy(data, header)
			return io.NopCloser(bytes.NewReader(data)), nil
		},
	}

	recorder := previewRequest(t, store, http.MethodHead, "limit.pdf", "")
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Equal(t, "application/pdf", recorder.Header().Get("Content-Type"))
	assert.Equal(
		t, "26214400", recorder.Header().Get("Content-Length"),
	)
}

func TestFileHandler_PreviewOpenFailure(t *testing.T) {
	data := []byte("%PDF-1.7\n%%EOF")
	store := previewStore(data)
	store.openFn = func(context.Context, string) (io.ReadCloser, error) {
		return nil, errors.New("provider unavailable")
	}

	recorder := previewRequest(t, store, http.MethodGet, "file.pdf", "")
	assert.Equal(t, http.StatusInternalServerError, recorder.Code)
	assert.Empty(t, recorder.Header().Get("Content-Length"))
	assert.Empty(t, recorder.Header().Get("Content-Type"))
	assert.Empty(t, recorder.Header().Get("Content-Disposition"))
	assert.Empty(t, recorder.Header().Get("Content-Security-Policy"))
	assert.Empty(t, recorder.Body.Bytes())
}

func TestParseSingleByteRange(t *testing.T) {
	tests := []struct {
		name  string
		value string
		size  int64
		want  *filestore.ByteRange
		ok    bool
	}{
		{name: "none", size: 100, ok: true},
		{name: "closed", value: "bytes=0-49", size: 100, want: &filestore.ByteRange{Start: 0, End: 49}, ok: true},
		{name: "open", value: "bytes=50-", size: 100, want: &filestore.ByteRange{Start: 50, End: 99}, ok: true},
		{name: "suffix", value: "bytes=-20", size: 100, want: &filestore.ByteRange{Start: 80, End: 99}, ok: true},
		{name: "large_suffix", value: "bytes=-200", size: 100, want: &filestore.ByteRange{Start: 0, End: 99}, ok: true},
		{name: "clamped_end", value: "bytes=90-200", size: 100, want: &filestore.ByteRange{Start: 90, End: 99}, ok: true},
		{name: "single", value: "bytes=42-42", size: 100, want: &filestore.ByteRange{Start: 42, End: 42}, ok: true},
		{name: "empty_object", value: "bytes=0-0", size: 0},
		{name: "wrong_unit", value: "items=0-1", size: 100},
		{name: "empty", value: "bytes=", size: 100},
		{name: "negative", value: "bytes=-0", size: 100},
		{name: "reversed", value: "bytes=10-9", size: 100},
		{name: "outside", value: "bytes=100-", size: 100},
		{name: "multiple", value: "bytes=0-1,4-5", size: 100},
		{name: "spaces", value: "bytes=0 - 1", size: 100},
		{name: "signed_start", value: "bytes=+1-2", size: 100},
		{name: "signed_end", value: "bytes=1-+2", size: 100},
		{name: "signed_suffix", value: "bytes=-+2", size: 100},
		{name: "overflow", value: "bytes=9223372036854775808-", size: math.MaxInt64},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got, present, err := parseSingleByteRange(test.value, test.size)
			if !test.ok {
				assert.ErrorIs(t, err, errInvalidByteRange)
				assert.False(t, present)
				return
			}
			require.NoError(t, err)
			if test.want == nil {
				assert.False(t, present)
				return
			}
			assert.True(t, present)
			assert.Equal(t, *test.want, got)
		})
	}
}

func TestFileHandler_PreviewInvalidRange(t *testing.T) {
	data := bytes.Repeat([]byte{0}, 100)
	recorder := previewRequest(
		t, previewStore(data), http.MethodGet, "movie.mp4", "bytes=100-",
	)
	assert.Equal(t, http.StatusRequestedRangeNotSatisfiable, recorder.Code)
	assert.Equal(t, "bytes */100", recorder.Header().Get("Content-Range"))
}

func TestCopyWithContext(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		var destination bytes.Buffer
		written, err := copyWithContext(
			context.Background(), &destination, bytes.NewBufferString("content"),
		)
		require.NoError(t, err)
		assert.Equal(t, int64(7), written)
		assert.Equal(t, "content", destination.String())
	})
	t.Run("canceled", func(t *testing.T) {
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		written, err := copyWithContext(ctx, io.Discard, bytes.NewBufferString("content"))
		assert.ErrorIs(t, err, context.Canceled)
		assert.Zero(t, written)
	})
}

type trackingReadCloser struct {
	reader io.Reader
	closed bool
}

func (r *trackingReadCloser) Read(buffer []byte) (int, error) {
	return r.reader.Read(buffer)
}

func (r *trackingReadCloser) Close() error {
	r.closed = true
	return nil
}

type readThenFail struct {
	content []byte
	read    bool
}

func (r *readThenFail) Read(buffer []byte) (int, error) {
	if r.read {
		return 0, errors.New("provider stream failed")
	}
	r.read = true
	return copy(buffer, r.content), errors.New("provider stream failed")
}

func TestFileHandler_PreviewClosesBodyOnCancellationAndReadFailure(t *testing.T) {
	data := []byte("%PDF-1.7\n%%EOF")
	tests := []struct {
		name   string
		reader io.Reader
		cancel bool
	}{
		{name: "canceled", reader: bytes.NewReader(data), cancel: true},
		{name: "read_failure", reader: &readThenFail{content: data}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			body := &trackingReadCloser{reader: test.reader}
			store := previewStore(data)
			store.openFn = func(context.Context, string) (io.ReadCloser, error) {
				return body, nil
			}
			router := newTestRouter()
			handler := &FileHandler{store: store}
			router.GET("/files/:key/preview", handler.Preview)
			ctx, cancel := context.WithCancel(context.Background())
			if test.cancel {
				cancel()
			} else {
				defer cancel()
			}
			request := httptest.NewRequest(
				http.MethodGet, "/files/file.pdf/preview", nil,
			).WithContext(ctx)
			recorder := httptest.NewRecorder()

			router.ServeHTTP(recorder, request)

			assert.Equal(t, http.StatusOK, recorder.Code)
			assert.True(t, body.closed)
			if test.cancel {
				assert.Empty(t, recorder.Body.Bytes())
			} else {
				assert.Equal(t, data, recorder.Body.Bytes())
			}
		})
	}
}
