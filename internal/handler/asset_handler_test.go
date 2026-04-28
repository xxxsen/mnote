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

func TestAssetHandler_List_Default(t *testing.T) {
	mock := &mockAssetHandlerService{
		listFn: func(_ context.Context, _, _ string, limit, offset uint) ([]service.AssetListItem, error) {
			assert.Equal(t, uint(20), limit)
			assert.Equal(t, uint(0), offset)
			return []service.AssetListItem{{Asset: model.Asset{ID: "a1"}, RefCount: 2}}, nil
		},
	}
	h := &AssetHandler{assets: mock}
	r := newTestRouter()
	r.GET("/assets", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/assets", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAssetHandler_List_WithParams(t *testing.T) {
	mock := &mockAssetHandlerService{
		listFn: func(_ context.Context, _, query string, limit, offset uint) ([]service.AssetListItem, error) {
			assert.Equal(t, "photo", query)
			assert.Equal(t, uint(10), limit)
			assert.Equal(t, uint(5), offset)
			return []service.AssetListItem{}, nil
		},
	}
	h := &AssetHandler{assets: mock}
	r := newTestRouter()
	r.GET("/assets", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/assets?q=photo&limit=10&offset=5", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAssetHandler_List_LimitCapped(t *testing.T) {
	mock := &mockAssetHandlerService{
		listFn: func(_ context.Context, _, _ string, limit, _ uint) ([]service.AssetListItem, error) {
			assert.Equal(t, uint(200), limit)
			return []service.AssetListItem{}, nil
		},
	}
	h := &AssetHandler{assets: mock}
	r := newTestRouter()
	r.GET("/assets", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/assets?limit=500", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAssetHandler_List_Error(t *testing.T) {
	mock := &mockAssetHandlerService{
		listFn: func(_ context.Context, _, _ string, _, _ uint) ([]service.AssetListItem, error) {
			return nil, errors.New("db error")
		},
	}
	h := &AssetHandler{assets: mock}
	r := newTestRouter()
	r.GET("/assets", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/assets", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAssetHandler_References_Success(t *testing.T) {
	mock := &mockAssetHandlerService{
		listRefsFn: func(_ context.Context, _, assetID string) ([]service.AssetReference, error) {
			assert.Equal(t, "a1", assetID)
			return []service.AssetReference{{DocumentID: "d1", Title: "Doc"}}, nil
		},
	}
	h := &AssetHandler{assets: mock}
	r := newTestRouter()
	r.GET("/assets/:id/references", withUserID("u1"), h.References)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/assets/a1/references", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAssetHandler_References_Error(t *testing.T) {
	mock := &mockAssetHandlerService{
		listRefsFn: func(_ context.Context, _, _ string) ([]service.AssetReference, error) {
			return nil, errors.New("not found")
		},
	}
	h := &AssetHandler{assets: mock}
	r := newTestRouter()
	r.GET("/assets/:id/references", withUserID("u1"), h.References)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/assets/a1/references", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}
