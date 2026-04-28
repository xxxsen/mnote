package handler

import (
	"bytes"
	"context"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"

	"github.com/xxxsen/mnote/internal/filestore"
	"github.com/xxxsen/mnote/internal/middleware"
)

func TestFileHandler_Get_Success(t *testing.T) {
	store := &mockFileStore{
		openFn: func(_ context.Context, key string) (io.ReadCloser, error) {
			assert.Equal(t, "testfile.png", key)
			return io.NopCloser(bytes.NewReader([]byte("image data"))), nil
		},
	}
	h := &FileHandler{store: store}
	r := newTestRouter()
	r.GET("/files/:key", h.Get)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/files/testfile.png", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "image/png", w.Header().Get("Content-Type"))
}

func TestFileHandler_Get_NotFound(t *testing.T) {
	store := &mockFileStore{
		openFn: func(_ context.Context, _ string) (io.ReadCloser, error) {
			return nil, errors.New("not found")
		},
	}
	h := &FileHandler{store: store}
	r := newTestRouter()
	r.GET("/files/:key", h.Get)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/files/missing.txt", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestFileHandler_Get_InvalidKey(t *testing.T) {
	h := &FileHandler{store: &mockFileStore{}}
	r := newTestRouter()
	r.GET("/files/:key", h.Get)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/files/..\\..\\etc\\passwd", nil)
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestFileHandler_Get_PathTraversalSlash(t *testing.T) {
	h := &FileHandler{store: &mockFileStore{}}
	r := newTestRouter()
	r.GET("/files/:key", h.Get)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/files/..%2f..%2fetc%2fpasswd", nil)
	r.ServeHTTP(w, req)

	// Gin decodes %2f to / before routing, causing 301 redirect or 404.
	// Either way the handler is never reached — Gin protects against path traversal.
	assert.NotEqual(t, http.StatusOK, w.Code)
}

func TestFileHandler_Upload_Success(t *testing.T) {
	store := &mockFileStore{
		genRefFn: func(_, _ string) string { return "user1_abc.png" },
		saveFn: func(_ context.Context, _ string, _ filestore.ReadSeekCloser, _ int64) error {
			return nil
		},
	}
	assetMock := &mockAssetHandlerService{
		recordUploadFn: func(_ context.Context, _, _, _, _, _ string, _ int64) error { return nil },
	}
	h := &FileHandler{store: store, maxUploadSize: 10 * 1024 * 1024, assets: assetMock}
	r := newTestRouter()
	r.POST("/files/upload", func(c *gin.Context) {
		c.Set(middleware.ContextUserIDKey, "u1")
		c.Next()
	}, h.Upload)

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, _ := writer.CreateFormFile("file", "photo.png")

	pngHeader := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
	data := make([]byte, 512)
	copy(data, pngHeader)
	_, _ = part.Write(data)
	_ = writer.Close()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/files/upload", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestFileHandler_Upload_NoFile(t *testing.T) {
	h := &FileHandler{store: &mockFileStore{}}
	r := newTestRouter()
	r.POST("/files/upload", withUserID("u1"), h.Upload)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/files/upload", nil)
	req.Header.Set("Content-Type", "multipart/form-data")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestFileHandler_Upload_TooLarge(t *testing.T) {
	h := &FileHandler{store: &mockFileStore{}, maxUploadSize: 100}
	r := newTestRouter()
	r.POST("/files/upload", withUserID("u1"), h.Upload)

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, _ := writer.CreateFormFile("file", "big.bin")
	_, _ = part.Write(make([]byte, 200))
	_ = writer.Close()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/files/upload", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestFileHandler_Get_ContentDisposition(t *testing.T) {
	store := &mockFileStore{
		openFn: func(_ context.Context, _ string) (io.ReadCloser, error) {
			return io.NopCloser(bytes.NewReader([]byte("data"))), nil
		},
	}
	h := &FileHandler{store: store}
	r := newTestRouter()
	r.GET("/files/:key", h.Get)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/files/file.pdf", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Header().Get("Content-Disposition"), "attachment")
}

func TestFileHandler_Upload_SaveError(t *testing.T) {
	store := &mockFileStore{
		genRefFn: func(_, _ string) string { return "key" },
		saveFn: func(_ context.Context, _ string, _ filestore.ReadSeekCloser, _ int64) error {
			return errors.New("save failed")
		},
	}
	h := &FileHandler{store: store, maxUploadSize: 10 * 1024 * 1024}
	r := newTestRouter()
	r.POST("/files/upload", func(c *gin.Context) {
		c.Set(middleware.ContextUserIDKey, "u1")
		c.Next()
	}, h.Upload)

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, _ := writer.CreateFormFile("file", "photo.png")
	pngHeader := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
	data := make([]byte, 512)
	copy(data, pngHeader)
	_, _ = part.Write(data)
	_ = writer.Close()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/files/upload", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestFileHandler_Upload_RecordAssetError(t *testing.T) {
	store := &mockFileStore{
		genRefFn: func(_, _ string) string { return "key" },
		saveFn: func(_ context.Context, _ string, _ filestore.ReadSeekCloser, _ int64) error {
			return nil
		},
	}
	assetMock := &mockAssetHandlerService{
		recordUploadFn: func(_ context.Context, _, _, _, _, _ string, _ int64) error {
			return errors.New("record error")
		},
	}
	h := &FileHandler{store: store, maxUploadSize: 10 * 1024 * 1024, assets: assetMock}
	r := newTestRouter()
	r.POST("/files/upload", func(c *gin.Context) {
		c.Set(middleware.ContextUserIDKey, "u1")
		c.Next()
	}, h.Upload)

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, _ := writer.CreateFormFile("file", "photo.png")
	pngHeader := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
	data := make([]byte, 512)
	copy(data, pngHeader)
	_, _ = part.Write(data)
	_ = writer.Close()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/files/upload", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestFileHandler_ResolveFileURL(t *testing.T) {
	assert.Equal(t, "https://cdn.example.com/file.png", resolveFileURL("https://cdn.example.com/file.png"))
	assert.Equal(t, "http://cdn.example.com/file.png", resolveFileURL("http://cdn.example.com/file.png"))
	assert.Equal(t, "/api/v1/files/user1_file.png", resolveFileURL("user1_file.png"))
}

func TestFileHandler_ResolveContentType(t *testing.T) {
	assert.Equal(t, "image/png", resolveContentType("application/octet-stream", "file.png"))
	assert.Equal(t, "text/html; charset=utf-8", resolveContentType("text/html; charset=utf-8", "file.html"))
	assert.Equal(t, "application/octet-stream", resolveContentType("application/octet-stream", "file.unknown"))
}

func TestFileHandler_SetAssetService(t *testing.T) {
	h := &FileHandler{store: &mockFileStore{}}
	assert.Nil(t, h.assets)
	mock := &mockAssetHandlerService{}
	h.SetAssetService(mock)
	assert.NotNil(t, h.assets)
}

func TestFileHandler_ExtractUserID_NoKey(t *testing.T) {
	r := newTestRouter()
	var result string
	r.GET("/test", func(c *gin.Context) {
		result = getUserID(c)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	assert.Empty(t, result)
}

func TestFileHandler_ExtractUserID_NonString(t *testing.T) {
	r := newTestRouter()
	var result string
	r.GET("/test", func(c *gin.Context) {
		c.Set(middleware.ContextUserIDKey, 12345)
		result = getUserID(c)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	assert.Empty(t, result)
}

func TestFileHandler_Get_EmptyKey(t *testing.T) {
	h := &FileHandler{store: &mockFileStore{}}
	r := newTestRouter()
	r.GET("/files/:key", h.Get)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/files/", nil)
	r.ServeHTTP(w, req)

	assert.NotEqual(t, http.StatusOK, w.Code)
}

func TestFileHandler_FormatUploadLimit(t *testing.T) {
	assert.Equal(t, "0MB", formatUploadLimit(0))
	assert.Equal(t, "0MB", formatUploadLimit(-1))
	assert.Equal(t, "1MB", formatUploadLimit(100))
	assert.Equal(t, "1MB", formatUploadLimit(1024*1024))
	assert.Equal(t, "10MB", formatUploadLimit(10*1024*1024))
}

func TestFileHandler_Upload_EmptyUserID(t *testing.T) {
	store := &mockFileStore{
		genRefFn: func(_, _ string) string { return "key" },
		saveFn: func(_ context.Context, _ string, _ filestore.ReadSeekCloser, _ int64) error {
			return nil
		},
	}
	h := &FileHandler{store: store, maxUploadSize: 10 * 1024 * 1024, assets: &mockAssetHandlerService{}}
	r := newTestRouter()
	r.POST("/files/upload", h.Upload)

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, _ := writer.CreateFormFile("file", "photo.png")
	pngHeader := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
	data := make([]byte, 512)
	copy(data, pngHeader)
	_, _ = part.Write(data)
	_ = writer.Close()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/files/upload", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestFileHandler_RecordAsset_NilAssets(t *testing.T) {
	h := &FileHandler{store: &mockFileStore{}, assets: nil}
	r := newTestRouter()

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, _ := writer.CreateFormFile("file", "photo.png")
	pngHeader := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}
	data := make([]byte, 512)
	copy(data, pngHeader)
	_, _ = part.Write(data)
	_ = writer.Close()

	h.store = &mockFileStore{
		genRefFn: func(_, _ string) string { return "key" },
		saveFn: func(_ context.Context, _ string, _ filestore.ReadSeekCloser, _ int64) error {
			return nil
		},
	}
	r.POST("/files/upload", func(c *gin.Context) {
		c.Set(middleware.ContextUserIDKey, "u1")
		c.Next()
	}, h.Upload)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/files/upload", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}
