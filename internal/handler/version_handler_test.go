package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/xxxsen/mnote/internal/model"
)

func TestVersionHandler_List_Success(t *testing.T) {
	mock := &mockDocumentService{
		listVersionsFn: func(_ context.Context, _, docID string) ([]model.DocumentVersionSummary, error) {
			assert.Equal(t, "d1", docID)
			return []model.DocumentVersionSummary{{Version: 1}, {Version: 2}}, nil
		},
	}
	h := &VersionHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents/:id/versions", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/d1/versions", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestVersionHandler_List_Error(t *testing.T) {
	mock := &mockDocumentService{
		listVersionsFn: func(_ context.Context, _, _ string) ([]model.DocumentVersionSummary, error) {
			return nil, errors.New("not found")
		},
	}
	h := &VersionHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents/:id/versions", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/d1/versions", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestVersionHandler_Get_Success(t *testing.T) {
	mock := &mockDocumentService{
		getVersionFn: func(_ context.Context, _, docID string, version int) (*model.DocumentVersion, error) {
			assert.Equal(t, "d1", docID)
			assert.Equal(t, 3, version)
			return &model.DocumentVersion{Version: 3, Title: "V3"}, nil
		},
	}
	h := &VersionHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents/:id/versions/:version", withUserID("u1"), h.Get)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/d1/versions/3", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestVersionHandler_Get_InvalidVersion(t *testing.T) {
	h := &VersionHandler{documents: &mockDocumentService{}}
	r := newTestRouter()
	r.GET("/documents/:id/versions/:version", withUserID("u1"), h.Get)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/d1/versions/abc", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestVersionHandler_Get_ServiceError(t *testing.T) {
	mock := &mockDocumentService{
		getVersionFn: func(_ context.Context, _, _ string, _ int) (*model.DocumentVersion, error) {
			return nil, errors.New("version not found")
		},
	}
	h := &VersionHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents/:id/versions/:version", withUserID("u1"), h.Get)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/d1/versions/1", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestVersionHandler_Get_ZeroVersion(t *testing.T) {
	h := &VersionHandler{documents: &mockDocumentService{}}
	r := newTestRouter()
	r.GET("/documents/:id/versions/:version", withUserID("u1"), h.Get)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/d1/versions/0", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}
