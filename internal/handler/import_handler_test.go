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

	"github.com/stretchr/testify/assert"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/service"
)

func TestImportHandler_NotesPreview_Success(t *testing.T) {
	mock := &mockImportHandlerService{
		previewFn: func(_ context.Context, _, jobID string) (*service.ImportPreview, error) {
			assert.Equal(t, "job1", jobID)
			return &service.ImportPreview{NotesCount: 5, Tags: []string{"Go"}, TagsCount: 1}, nil
		},
	}
	h := &ImportHandler{imports: mock}
	r := newTestRouter()
	r.GET("/import/notes/:job_id/preview", withUserID("u1"), h.NotesPreview)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/import/notes/job1/preview", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestImportHandler_NotesPreview_Error(t *testing.T) {
	mock := &mockImportHandlerService{
		previewFn: func(_ context.Context, _, _ string) (*service.ImportPreview, error) {
			return nil, errors.New("job not found")
		},
	}
	h := &ImportHandler{imports: mock}
	r := newTestRouter()
	r.GET("/import/notes/:job_id/preview", withUserID("u1"), h.NotesPreview)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/import/notes/bad/preview", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestImportHandler_NotesConfirm_Success(t *testing.T) {
	mock := &mockImportHandlerService{
		confirmFn: func(_ context.Context, _, _, mode string) error {
			assert.Equal(t, "append", mode)
			return nil
		},
	}
	h := &ImportHandler{imports: mock}
	r := newTestRouter()
	r.POST("/import/notes/:job_id/confirm", withUserID("u1"), h.NotesConfirm)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/import/notes/job1/confirm", importConfirmRequest{Mode: "append"})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestImportHandler_NotesConfirm_Error(t *testing.T) {
	mock := &mockImportHandlerService{
		confirmFn: func(_ context.Context, _, _, _ string) error {
			return errors.New("already running")
		},
	}
	h := &ImportHandler{imports: mock}
	r := newTestRouter()
	r.POST("/import/notes/:job_id/confirm", withUserID("u1"), h.NotesConfirm)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/import/notes/job1/confirm", importConfirmRequest{Mode: "append"})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestImportHandler_NotesStatus_Success(t *testing.T) {
	mock := &mockImportHandlerService{
		statusFn: func(_ context.Context, _, _ string) (*model.ImportJob, error) {
			return &model.ImportJob{Status: "done", Processed: 10, Total: 10}, nil
		},
	}
	h := &ImportHandler{imports: mock}
	r := newTestRouter()
	r.GET("/import/notes/:job_id/status", withUserID("u1"), h.NotesStatus)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/import/notes/job1/status", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestImportHandler_HedgeDocPreview_Success(t *testing.T) {
	mock := &mockImportHandlerService{
		previewFn: func(_ context.Context, _, _ string) (*service.ImportPreview, error) {
			return &service.ImportPreview{NotesCount: 3}, nil
		},
	}
	h := &ImportHandler{imports: mock}
	r := newTestRouter()
	r.GET("/import/hedgedoc/:job_id/preview", withUserID("u1"), h.HedgeDocPreview)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/import/hedgedoc/job1/preview", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestImportHandler_HedgeDocConfirm_Success(t *testing.T) {
	mock := &mockImportHandlerService{
		confirmFn: func(_ context.Context, _, _, _ string) error { return nil },
	}
	h := &ImportHandler{imports: mock}
	r := newTestRouter()
	r.POST("/import/hedgedoc/:job_id/confirm", withUserID("u1"), h.HedgeDocConfirm)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/import/hedgedoc/job1/confirm", importConfirmRequest{Mode: "skip"})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestImportHandler_HedgeDocStatus_Success(t *testing.T) {
	mock := &mockImportHandlerService{
		statusFn: func(_ context.Context, _, _ string) (*model.ImportJob, error) {
			return &model.ImportJob{Status: "running", Processed: 5, Total: 10}, nil
		},
	}
	h := &ImportHandler{imports: mock}
	r := newTestRouter()
	r.GET("/import/hedgedoc/:job_id/status", withUserID("u1"), h.HedgeDocStatus)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/import/hedgedoc/job1/status", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestImportHandler_NotesConfirm_InvalidJSON(t *testing.T) {
	h := &ImportHandler{imports: &mockImportHandlerService{}}
	r := newTestRouter()
	r.POST("/import/notes/:job_id/confirm", withUserID("u1"), h.NotesConfirm)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/import/notes/job1/confirm", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestImportHandler_HedgeDocPreview_Error(t *testing.T) {
	mock := &mockImportHandlerService{
		previewFn: func(_ context.Context, _, _ string) (*service.ImportPreview, error) {
			return nil, errors.New("preview error")
		},
	}
	h := &ImportHandler{imports: mock}
	r := newTestRouter()
	r.GET("/import/hedgedoc/:job_id/preview", withUserID("u1"), h.HedgeDocPreview)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/import/hedgedoc/bad/preview", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestImportHandler_HedgeDocConfirm_InvalidJSON(t *testing.T) {
	h := &ImportHandler{imports: &mockImportHandlerService{}}
	r := newTestRouter()
	r.POST("/import/hedgedoc/:job_id/confirm", withUserID("u1"), h.HedgeDocConfirm)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/import/hedgedoc/job1/confirm", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestImportHandler_HedgeDocConfirm_Error(t *testing.T) {
	mock := &mockImportHandlerService{
		confirmFn: func(_ context.Context, _, _, _ string) error {
			return errors.New("confirm error")
		},
	}
	h := &ImportHandler{imports: mock}
	r := newTestRouter()
	r.POST("/import/hedgedoc/:job_id/confirm", withUserID("u1"), h.HedgeDocConfirm)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/import/hedgedoc/job1/confirm", importConfirmRequest{Mode: "skip"})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestImportHandler_HedgeDocStatus_Error(t *testing.T) {
	mock := &mockImportHandlerService{
		statusFn: func(_ context.Context, _, _ string) (*model.ImportJob, error) {
			return nil, errors.New("status error")
		},
	}
	h := &ImportHandler{imports: mock}
	r := newTestRouter()
	r.GET("/import/hedgedoc/:job_id/status", withUserID("u1"), h.HedgeDocStatus)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/import/hedgedoc/job1/status", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestImportHandler_NotesStatus_Error(t *testing.T) {
	mock := &mockImportHandlerService{
		statusFn: func(_ context.Context, _, _ string) (*model.ImportJob, error) {
			return nil, errors.New("status error")
		},
	}
	h := &ImportHandler{imports: mock}
	r := newTestRouter()
	r.GET("/import/notes/:job_id/status", withUserID("u1"), h.NotesStatus)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/import/notes/job1/status", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestImportHandler_HandleZipUpload_NoFile(t *testing.T) {
	h := &ImportHandler{imports: &mockImportHandlerService{}, maxUploadSize: 10 * 1024 * 1024}
	r := newTestRouter()
	r.POST("/import/notes/upload", withUserID("u1"), h.NotesUpload)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/import/notes/upload", nil)
	req.Header.Set("Content-Type", "multipart/form-data")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestImportHandler_HandleZipUpload_NotZip(t *testing.T) {
	h := &ImportHandler{imports: &mockImportHandlerService{}, maxUploadSize: 10 * 1024 * 1024}
	r := newTestRouter()
	r.POST("/import/notes/upload", withUserID("u1"), h.NotesUpload)

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, _ := writer.CreateFormFile("file", "notes.txt")
	_, _ = part.Write([]byte("hello"))
	_ = writer.Close()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/import/notes/upload", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestImportHandler_HandleZipUpload_TooLarge(t *testing.T) {
	h := &ImportHandler{imports: &mockImportHandlerService{}, maxUploadSize: 10}
	r := newTestRouter()
	r.POST("/import/notes/upload", withUserID("u1"), h.NotesUpload)

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, _ := writer.CreateFormFile("file", "notes.zip")
	_, _ = part.Write(make([]byte, 100))
	_ = writer.Close()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/import/notes/upload", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestImportHandler_RemoveFile_EmptyPath(t *testing.T) {
	assert.NoError(t, removeFile(""))
}

func TestImportHandler_RemoveFile_NonExistent(t *testing.T) {
	err := removeFile("/nonexistent/path/file.zip")
	assert.Error(t, err)
}

func mockSaveTempFile(_ string, _ io.Reader) (string, error) {
	return "/tmp/mock-temp-file.zip", nil
}

func TestImportHandler_HandleZipUpload_NotesSuccess(t *testing.T) {
	mock := &mockImportHandlerService{
		createNotesJobFn: func(_ context.Context, _, _ string) (*model.ImportJob, error) {
			return &model.ImportJob{ID: "job1"}, nil
		},
	}
	origRemove := osRemove
	osRemove = func(_ string) error { return nil }
	defer func() { osRemove = origRemove }()

	h := &ImportHandler{imports: mock, maxUploadSize: 10 * 1024 * 1024, saveTempFile: mockSaveTempFile}
	r := newTestRouter()
	r.POST("/import/notes/upload", withUserID("u1"), h.NotesUpload)

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, _ := writer.CreateFormFile("file", "notes.zip")
	_, _ = part.Write([]byte("PK\x03\x04 zip content"))
	_ = writer.Close()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/import/notes/upload", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	resp := parseResponseT(t, w)
	data, ok := resp["data"].(map[string]any)
	assert.True(t, ok)
	assert.Equal(t, "job1", data["job_id"])
}

func TestImportHandler_HandleZipUpload_HedgeDocSuccess(t *testing.T) {
	mock := &mockImportHandlerService{
		createHedgeDocJobFn: func(_ context.Context, _, _ string) (*model.ImportJob, error) {
			return &model.ImportJob{ID: "job2"}, nil
		},
	}
	origRemove := osRemove
	osRemove = func(_ string) error { return nil }
	defer func() { osRemove = origRemove }()

	h := &ImportHandler{imports: mock, maxUploadSize: 10 * 1024 * 1024, saveTempFile: mockSaveTempFile}
	r := newTestRouter()
	r.POST("/import/hedgedoc/upload", withUserID("u1"), h.HedgeDocUpload)

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, _ := writer.CreateFormFile("file", "hedgedoc.zip")
	_, _ = part.Write([]byte("PK\x03\x04 zip content"))
	_ = writer.Close()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/import/hedgedoc/upload", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestImportHandler_HandleZipUpload_CreateJobError(t *testing.T) {
	mock := &mockImportHandlerService{
		createNotesJobFn: func(_ context.Context, _, _ string) (*model.ImportJob, error) {
			return nil, errors.New("create job failed")
		},
	}
	origRemove := osRemove
	osRemove = func(_ string) error { return nil }
	defer func() { osRemove = origRemove }()

	h := &ImportHandler{imports: mock, maxUploadSize: 10 * 1024 * 1024, saveTempFile: mockSaveTempFile}
	r := newTestRouter()
	r.POST("/import/notes/upload", withUserID("u1"), h.NotesUpload)

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, _ := writer.CreateFormFile("file", "notes.zip")
	_, _ = part.Write([]byte("PK\x03\x04 zip content"))
	_ = writer.Close()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/import/notes/upload", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestImportHandler_HandleZipUpload_SaveTempFileError(t *testing.T) {
	failSave := func(_ string, _ io.Reader) (string, error) {
		return "", errors.New("disk full")
	}
	h := &ImportHandler{imports: &mockImportHandlerService{}, maxUploadSize: 10 * 1024 * 1024, saveTempFile: failSave}
	r := newTestRouter()
	r.POST("/import/notes/upload", withUserID("u1"), h.NotesUpload)

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	part, _ := writer.CreateFormFile("file", "notes.zip")
	_, _ = part.Write([]byte("PK\x03\x04 zip content"))
	_ = writer.Close()

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/import/notes/upload", &buf)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestImportHandler_HandleJobStatus_ZeroTotal(t *testing.T) {
	mock := &mockImportHandlerService{
		statusFn: func(_ context.Context, _, _ string) (*model.ImportJob, error) {
			return &model.ImportJob{Status: "parsing", Processed: 0, Total: 0}, nil
		},
	}
	h := &ImportHandler{imports: mock}
	r := newTestRouter()
	r.GET("/import/notes/:job_id/status", withUserID("u1"), h.NotesStatus)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/import/notes/job1/status", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}
