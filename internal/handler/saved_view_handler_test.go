package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/service"
)

func TestSavedViewHandler_List_Success(t *testing.T) {
	mock := &mockSavedViewService{
		listFn: func(_ context.Context, _ string) ([]model.SavedView, error) {
			return []model.SavedView{{ID: "sv1", Name: "My View"}}, nil
		},
	}
	h := &SavedViewHandler{service: mock}
	r := newTestRouter()
	r.GET("/saved-views", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/saved-views", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	resp := parseResponseT(t, w)
	assert.Equal(t, float64(0), resp["code"])
}

func TestSavedViewHandler_List_Error(t *testing.T) {
	mock := &mockSavedViewService{
		listFn: func(_ context.Context, _ string) ([]model.SavedView, error) {
			return nil, errors.New("db error")
		},
	}
	h := &SavedViewHandler{service: mock}
	r := newTestRouter()
	r.GET("/saved-views", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/saved-views", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestSavedViewHandler_Create_Success(t *testing.T) {
	mock := &mockSavedViewService{
		createFn: func(_ context.Context, _ string, input service.SavedViewCreateInput) (*model.SavedView, error) {
			return &model.SavedView{ID: "sv1", Name: input.Name}, nil
		},
	}
	h := &SavedViewHandler{service: mock}
	r := newTestRouter()
	r.POST("/saved-views", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/saved-views", savedViewCreateRequest{
		Name: "My View", Search: "golang", ShowStarred: true,
	})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	resp := parseResponseT(t, w)
	assert.Equal(t, float64(0), resp["code"])
}

func TestSavedViewHandler_Create_Error(t *testing.T) {
	mock := &mockSavedViewService{
		createFn: func(_ context.Context, _ string, _ service.SavedViewCreateInput) (*model.SavedView, error) {
			return nil, errors.New("invalid")
		},
	}
	h := &SavedViewHandler{service: mock}
	r := newTestRouter()
	r.POST("/saved-views", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/saved-views", savedViewCreateRequest{Name: "V"})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestSavedViewHandler_Delete_Success(t *testing.T) {
	mock := &mockSavedViewService{
		deleteFn: func(_ context.Context, _, _ string) error { return nil },
	}
	h := &SavedViewHandler{service: mock}
	r := newTestRouter()
	r.DELETE("/saved-views/:id", withUserID("u1"), h.Delete)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/saved-views/sv1", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestSavedViewHandler_Create_InvalidJSON(t *testing.T) {
	h := &SavedViewHandler{service: &mockSavedViewService{}}
	r := newTestRouter()
	r.POST("/saved-views", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/saved-views", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestSavedViewHandler_Create_WithShowShared(t *testing.T) {
	mock := &mockSavedViewService{
		createFn: func(_ context.Context, _ string, input service.SavedViewCreateInput) (*model.SavedView, error) {
			assert.Equal(t, 1, input.ShowShared)
			assert.Equal(t, 0, input.ShowStarred)
			return &model.SavedView{ID: "sv1"}, nil
		},
	}
	h := &SavedViewHandler{service: mock}
	r := newTestRouter()
	r.POST("/saved-views", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/saved-views", savedViewCreateRequest{
		Name: "View", ShowShared: true,
	})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestSavedViewHandler_Delete_Error(t *testing.T) {
	mock := &mockSavedViewService{
		deleteFn: func(_ context.Context, _, _ string) error { return errors.New("not found") },
	}
	h := &SavedViewHandler{service: mock}
	r := newTestRouter()
	r.DELETE("/saved-views/:id", withUserID("u1"), h.Delete)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/saved-views/sv1", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}
