package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/service"
)

func TestExportHandler_Export_Success(t *testing.T) {
	mock := &mockExportService{
		exportFn: func(_ context.Context, _ string) (*service.ExportPayload, error) {
			return &service.ExportPayload{
				Documents: []model.Document{{ID: "d1"}},
				Tags:      []model.Tag{{ID: "t1"}},
			}, nil
		},
	}
	h := &ExportHandler{export: mock}
	r := newTestRouter()
	r.GET("/export", withUserID("u1"), h.Export)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/export", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestExportHandler_Export_Error(t *testing.T) {
	mock := &mockExportService{
		exportFn: func(_ context.Context, _ string) (*service.ExportPayload, error) {
			return nil, errors.New("db error")
		},
	}
	h := &ExportHandler{export: mock}
	r := newTestRouter()
	r.GET("/export", withUserID("u1"), h.Export)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/export", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestExportHandler_ConvertMarkdownToConfluenceHTML_Success(t *testing.T) {
	mock := &mockExportService{
		convertHTMLFn: func(_ context.Context, _, docID string) (string, error) {
			return "<p>Hello</p>", nil
		},
	}
	h := &ExportHandler{export: mock}
	r := newTestRouter()
	r.POST("/export/confluence-html", withUserID("u1"), h.ConvertMarkdownToConfluenceHTML)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/export/confluence-html", markdownToConfluenceHTMLRequest{
		DocumentID: "d1",
	})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestExportHandler_ConvertMarkdownToConfluenceHTML_EmptyID(t *testing.T) {
	h := &ExportHandler{export: &mockExportService{}}
	r := newTestRouter()
	r.POST("/export/confluence-html", withUserID("u1"), h.ConvertMarkdownToConfluenceHTML)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/export/confluence-html", markdownToConfluenceHTMLRequest{})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestExportHandler_ExportNotes_Success(t *testing.T) {
	tmpFile, err := os.CreateTemp("", "test-export-*.zip")
	assert.NoError(t, err)
	_, _ = tmpFile.Write([]byte("PK zip content"))
	_ = tmpFile.Close()

	mock := &mockExportService{
		exportNotesFn: func(_ context.Context, _ string) (string, error) {
			return tmpFile.Name(), nil
		},
	}
	h := &ExportHandler{export: mock}
	r := newTestRouter()
	r.GET("/export/notes", withUserID("u1"), h.ExportNotes)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/export/notes", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Contains(t, w.Header().Get("Content-Disposition"), "mnote-notes-")
}

func TestExportHandler_ExportNotes_Error(t *testing.T) {
	mock := &mockExportService{
		exportNotesFn: func(_ context.Context, _ string) (string, error) {
			return "", errors.New("export error")
		},
	}
	h := &ExportHandler{export: mock}
	r := newTestRouter()
	r.GET("/export/notes", withUserID("u1"), h.ExportNotes)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/export/notes", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestExportHandler_ConvertMarkdownToConfluenceHTML_InvalidJSON(t *testing.T) {
	h := &ExportHandler{export: &mockExportService{}}
	r := newTestRouter()
	r.POST("/export/confluence-html", withUserID("u1"), h.ConvertMarkdownToConfluenceHTML)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/export/confluence-html", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestExportHandler_ConvertMarkdownToConfluenceHTML_Error(t *testing.T) {
	mock := &mockExportService{
		convertHTMLFn: func(_ context.Context, _, _ string) (string, error) {
			return "", errors.New("not found")
		},
	}
	h := &ExportHandler{export: mock}
	r := newTestRouter()
	r.POST("/export/confluence-html", withUserID("u1"), h.ConvertMarkdownToConfluenceHTML)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/export/confluence-html", markdownToConfluenceHTMLRequest{
		DocumentID: "d1",
	})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}
