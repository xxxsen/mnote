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

func TestTagHandler_Create_Success(t *testing.T) {
	mock := &mockTagService{
		createFn: func(_ context.Context, _, name string) (*model.Tag, error) {
			return &model.Tag{ID: "tag1", Name: name}, nil
		},
	}
	h := &TagHandler{tags: mock}
	r := newTestRouter()
	r.POST("/tags", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/tags", map[string]string{"name": "Go"})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	resp := parseResponseT(t, w)
	assert.Equal(t, float64(0), resp["code"])
}

func TestTagHandler_Create_EmptyName(t *testing.T) {
	h := &TagHandler{tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/tags", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/tags", map[string]string{"name": ""})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTagHandler_CreateBatch_Success(t *testing.T) {
	mock := &mockTagService{
		createBatchFn: func(_ context.Context, _ string, names []string) ([]model.Tag, error) {
			tags := make([]model.Tag, 0, len(names))
			for _, n := range names {
				tags = append(tags, model.Tag{Name: n})
			}
			return tags, nil
		},
	}
	h := &TagHandler{tags: mock}
	r := newTestRouter()
	r.POST("/tags/batch", withUserID("u1"), h.CreateBatch)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/tags/batch", map[string]any{"names": []string{"Go", "Rust"}})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTagHandler_CreateBatch_EmptyNames(t *testing.T) {
	h := &TagHandler{tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/tags/batch", withUserID("u1"), h.CreateBatch)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/tags/batch", map[string]any{"names": []string{}})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTagHandler_List_NoParams(t *testing.T) {
	mock := &mockTagService{
		listFn: func(_ context.Context, _ string) ([]model.Tag, error) {
			return []model.Tag{{ID: "t1", Name: "Go"}}, nil
		},
	}
	h := &TagHandler{tags: mock}
	r := newTestRouter()
	r.GET("/tags", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/tags", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTagHandler_List_WithQuery(t *testing.T) {
	mock := &mockTagService{
		listPageFn: func(_ context.Context, _, query string, limit, offset int) ([]model.Tag, error) {
			assert.Equal(t, "Go", query)
			return []model.Tag{}, nil
		},
	}
	h := &TagHandler{tags: mock}
	r := newTestRouter()
	r.GET("/tags", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/tags?q=Go", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTagHandler_List_WithPagination(t *testing.T) {
	mock := &mockTagService{
		listPageFn: func(_ context.Context, _, _ string, limit, offset int) ([]model.Tag, error) {
			assert.Equal(t, 10, limit)
			assert.Equal(t, 5, offset)
			return []model.Tag{}, nil
		},
	}
	h := &TagHandler{tags: mock}
	r := newTestRouter()
	r.GET("/tags", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/tags?limit=10&offset=5", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTagHandler_List_LimitCapped(t *testing.T) {
	mock := &mockTagService{
		listPageFn: func(_ context.Context, _, _ string, limit, _ int) ([]model.Tag, error) {
			assert.Equal(t, 20, limit)
			return []model.Tag{}, nil
		},
	}
	h := &TagHandler{tags: mock}
	r := newTestRouter()
	r.GET("/tags", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/tags?limit=100", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTagHandler_ListByIDs_Success(t *testing.T) {
	mock := &mockTagService{
		listByIDsFn: func(_ context.Context, _ string, ids []string) ([]model.Tag, error) {
			return []model.Tag{{ID: ids[0]}}, nil
		},
	}
	h := &TagHandler{tags: mock}
	r := newTestRouter()
	r.POST("/tags/ids", withUserID("u1"), h.ListByIDs)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/tags/ids", map[string]any{"ids": []string{"t1"}})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTagHandler_ListByIDs_EmptyIDs(t *testing.T) {
	h := &TagHandler{tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/tags/ids", withUserID("u1"), h.ListByIDs)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/tags/ids", map[string]any{"ids": []string{}})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTagHandler_Summary_Success(t *testing.T) {
	mock := &mockTagService{
		listSummaryFn: func(_ context.Context, _, _ string, _, _ int) ([]model.TagSummary, error) {
			return []model.TagSummary{}, nil
		},
	}
	h := &TagHandler{tags: mock}
	r := newTestRouter()
	r.GET("/tags/summary", withUserID("u1"), h.Summary)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/tags/summary", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTagHandler_Delete_Success(t *testing.T) {
	mock := &mockTagService{
		deleteFn: func(_ context.Context, _, _ string) error { return nil },
	}
	h := &TagHandler{tags: mock}
	r := newTestRouter()
	r.DELETE("/tags/:id", withUserID("u1"), h.Delete)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/tags/t1", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTagHandler_Delete_Error(t *testing.T) {
	mock := &mockTagService{
		deleteFn: func(_ context.Context, _, _ string) error { return errors.New("not found") },
	}
	h := &TagHandler{tags: mock}
	r := newTestRouter()
	r.DELETE("/tags/:id", withUserID("u1"), h.Delete)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/tags/t1", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTagHandler_Pin_Success(t *testing.T) {
	mock := &mockTagService{
		updatePinnedFn: func(_ context.Context, _, _ string, pinned int) error {
			assert.Equal(t, 1, pinned)
			return nil
		},
	}
	h := &TagHandler{tags: mock}
	r := newTestRouter()
	r.PUT("/tags/:id/pin", withUserID("u1"), h.Pin)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/tags/t1/pin", map[string]any{"pinned": true})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTagHandler_Pin_Unpin(t *testing.T) {
	mock := &mockTagService{
		updatePinnedFn: func(_ context.Context, _, _ string, pinned int) error {
			assert.Equal(t, 0, pinned)
			return nil
		},
	}
	h := &TagHandler{tags: mock}
	r := newTestRouter()
	r.PUT("/tags/:id/pin", withUserID("u1"), h.Pin)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/tags/t1/pin", map[string]any{"pinned": false})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTagHandler_Create_ServiceError(t *testing.T) {
	mock := &mockTagService{
		createFn: func(_ context.Context, _, _ string) (*model.Tag, error) {
			return nil, errors.New("conflict")
		},
	}
	h := &TagHandler{tags: mock}
	r := newTestRouter()
	r.POST("/tags", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/tags", map[string]string{"name": "Go"})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTagHandler_Create_InvalidJSON(t *testing.T) {
	h := &TagHandler{tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/tags", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/tags", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTagHandler_CreateBatch_ServiceError(t *testing.T) {
	mock := &mockTagService{
		createBatchFn: func(_ context.Context, _ string, _ []string) ([]model.Tag, error) {
			return nil, errors.New("batch error")
		},
	}
	h := &TagHandler{tags: mock}
	r := newTestRouter()
	r.POST("/tags/batch", withUserID("u1"), h.CreateBatch)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/tags/batch", map[string]any{"names": []string{"Go"}})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTagHandler_CreateBatch_InvalidJSON(t *testing.T) {
	h := &TagHandler{tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/tags/batch", withUserID("u1"), h.CreateBatch)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/tags/batch", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTagHandler_List_Error(t *testing.T) {
	mock := &mockTagService{
		listFn: func(_ context.Context, _ string) ([]model.Tag, error) {
			return nil, errors.New("db error")
		},
	}
	h := &TagHandler{tags: mock}
	r := newTestRouter()
	r.GET("/tags", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/tags", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTagHandler_ListByIDs_ServiceError(t *testing.T) {
	mock := &mockTagService{
		listByIDsFn: func(_ context.Context, _ string, _ []string) ([]model.Tag, error) {
			return nil, errors.New("ids error")
		},
	}
	h := &TagHandler{tags: mock}
	r := newTestRouter()
	r.POST("/tags/ids", withUserID("u1"), h.ListByIDs)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/tags/ids", map[string]any{"ids": []string{"t1"}})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTagHandler_ListByIDs_InvalidJSON(t *testing.T) {
	h := &TagHandler{tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/tags/ids", withUserID("u1"), h.ListByIDs)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/tags/ids", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTagHandler_Summary_WithLimitOffset(t *testing.T) {
	mock := &mockTagService{
		listSummaryFn: func(_ context.Context, _, query string, limit, offset int) ([]model.TagSummary, error) {
			assert.Equal(t, "Go", query)
			assert.Equal(t, 10, limit)
			assert.Equal(t, 5, offset)
			return []model.TagSummary{}, nil
		},
	}
	h := &TagHandler{tags: mock}
	r := newTestRouter()
	r.GET("/tags/summary", withUserID("u1"), h.Summary)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/tags/summary?q=Go&limit=10&offset=5", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTagHandler_Summary_LimitCapped(t *testing.T) {
	mock := &mockTagService{
		listSummaryFn: func(_ context.Context, _, _ string, limit, _ int) ([]model.TagSummary, error) {
			assert.Equal(t, 20, limit)
			return []model.TagSummary{}, nil
		},
	}
	h := &TagHandler{tags: mock}
	r := newTestRouter()
	r.GET("/tags/summary", withUserID("u1"), h.Summary)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/tags/summary?limit=100", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTagHandler_Summary_Error(t *testing.T) {
	mock := &mockTagService{
		listSummaryFn: func(_ context.Context, _, _ string, _, _ int) ([]model.TagSummary, error) {
			return nil, errors.New("summary error")
		},
	}
	h := &TagHandler{tags: mock}
	r := newTestRouter()
	r.GET("/tags/summary", withUserID("u1"), h.Summary)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/tags/summary", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTagHandler_Pin_ServiceError(t *testing.T) {
	mock := &mockTagService{
		updatePinnedFn: func(_ context.Context, _, _ string, _ int) error {
			return errors.New("pin error")
		},
	}
	h := &TagHandler{tags: mock}
	r := newTestRouter()
	r.PUT("/tags/:id/pin", withUserID("u1"), h.Pin)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/tags/t1/pin", map[string]any{"pinned": true})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTagHandler_Pin_InvalidJSON(t *testing.T) {
	h := &TagHandler{tags: &mockTagService{}}
	r := newTestRouter()
	r.PUT("/tags/:id/pin", withUserID("u1"), h.Pin)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("PUT", "/tags/t1/pin", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTagHandler_List_PageError(t *testing.T) {
	mock := &mockTagService{
		listPageFn: func(_ context.Context, _, _ string, _, _ int) ([]model.Tag, error) {
			return nil, errors.New("page error")
		},
	}
	h := &TagHandler{tags: mock}
	r := newTestRouter()
	r.GET("/tags", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/tags?q=Go", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}
