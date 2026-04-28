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

func newDocMock() *mockDocumentService {
	return &mockDocumentService{}
}

func TestDocumentHandler_Create_Success(t *testing.T) {
	mock := newDocMock()
	mock.createFn = func(_ context.Context, _ string, input service.DocumentCreateInput) (*model.Document, error) {
		return &model.Document{ID: "d1", Title: input.Title}, nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.POST("/documents", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/documents", documentRequest{Title: "Hello"})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	resp := parseResponseT(t, w)
	assert.Equal(t, float64(0), resp["code"])
}

func TestDocumentHandler_Create_EmptyTitle(t *testing.T) {
	h := &DocumentHandler{documents: newDocMock()}
	r := newTestRouter()
	r.POST("/documents", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/documents", documentRequest{Title: ""})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_Create_WithTags(t *testing.T) {
	mock := newDocMock()
	mock.createFn = func(_ context.Context, _ string, input service.DocumentCreateInput) (*model.Document, error) {
		assert.Equal(t, []string{"t1", "t2"}, input.TagIDs)
		return &model.Document{ID: "d1"}, nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.POST("/documents", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	tagIDs := []string{"t1", "t2"}
	req := jsonRequestT(t, "POST", "/documents", documentRequest{Title: "T", TagIDs: &tagIDs})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_Get_Success(t *testing.T) {
	mock := newDocMock()
	mock.getFn = func(_ context.Context, _, docID string) (*model.Document, error) {
		return &model.Document{ID: docID, Title: "Doc"}, nil
	}
	mock.listTagIDsFn = func(_ context.Context, _, _ string) ([]string, error) {
		return []string{"t1"}, nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents/:id", withUserID("u1"), h.Get)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/d1", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_Get_WithIncludeTags(t *testing.T) {
	mock := newDocMock()
	mock.getFn = func(_ context.Context, _, _ string) (*model.Document, error) {
		return &model.Document{ID: "d1"}, nil
	}
	mock.listTagIDsFn = func(_ context.Context, _, _ string) ([]string, error) {
		return []string{"t1"}, nil
	}
	mock.listTagsByIDsFn = func(_ context.Context, _ string, ids []string) ([]model.Tag, error) {
		return []model.Tag{{ID: "t1", Name: "Go"}}, nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents/:id", withUserID("u1"), h.Get)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/d1?include=tags", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_Get_Error(t *testing.T) {
	mock := newDocMock()
	mock.getFn = func(_ context.Context, _, _ string) (*model.Document, error) {
		return nil, errors.New("not found")
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents/:id", withUserID("u1"), h.Get)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/d1", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_List_Success(t *testing.T) {
	mock := newDocMock()
	mock.searchFn = func(_ context.Context, _, _, _ string, _ *int, _, _ uint, _ string) ([]model.Document, error) {
		return []model.Document{{ID: "d1", Title: "Doc1"}}, nil
	}
	mock.listTagIDsByDocIDsFn = func(_ context.Context, _ string, _ []string) (map[string][]string, error) {
		return map[string][]string{"d1": {"t1"}}, nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_List_WithIncludeTags(t *testing.T) {
	mock := newDocMock()
	mock.searchFn = func(_ context.Context, _, _, _ string, _ *int, _, _ uint, _ string) ([]model.Document, error) {
		return []model.Document{{ID: "d1"}}, nil
	}
	mock.listTagIDsByDocIDsFn = func(_ context.Context, _ string, _ []string) (map[string][]string, error) {
		return map[string][]string{"d1": {"t1"}}, nil
	}
	mock.listTagsByIDsFn = func(_ context.Context, _ string, _ []string) ([]model.Tag, error) {
		return []model.Tag{{ID: "t1", Name: "Go"}}, nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents?include=tags", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_Update_Success(t *testing.T) {
	mock := newDocMock()
	mock.updateFn = func(_ context.Context, _, docID string, _ service.DocumentUpdateInput) error {
		assert.Equal(t, "d1", docID)
		return nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.PUT("/documents/:id", withUserID("u1"), h.Update)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/documents/d1", documentRequest{Title: "Updated"})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_Update_EmptyTitle(t *testing.T) {
	h := &DocumentHandler{documents: newDocMock()}
	r := newTestRouter()
	r.PUT("/documents/:id", withUserID("u1"), h.Update)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/documents/d1", documentRequest{Title: ""})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_UpdateTags_Success(t *testing.T) {
	mock := newDocMock()
	mock.updateTagsFn = func(_ context.Context, _, _ string, tagIDs []string) error {
		assert.Equal(t, []string{"t1"}, tagIDs)
		return nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.PUT("/documents/:id/tags", withUserID("u1"), h.UpdateTags)

	w := httptest.NewRecorder()
	tags := []string{"t1"}
	req := jsonRequestT(t, "PUT", "/documents/d1/tags", tagUpdateRequest{TagIDs: &tags})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_UpdateTags_NilTagIDs(t *testing.T) {
	h := &DocumentHandler{documents: newDocMock()}
	r := newTestRouter()
	r.PUT("/documents/:id/tags", withUserID("u1"), h.UpdateTags)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/documents/d1/tags", tagUpdateRequest{TagIDs: nil})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_UpdateSummary_Success(t *testing.T) {
	mock := newDocMock()
	mock.updateSummaryFn = func(_ context.Context, _, _, _ string) error { return nil }
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.PUT("/documents/:id/summary", withUserID("u1"), h.UpdateSummary)

	w := httptest.NewRecorder()
	s := "A short summary"
	req := jsonRequestT(t, "PUT", "/documents/d1/summary", summaryUpdateRequest{Summary: &s})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_UpdateSummary_NilSummary(t *testing.T) {
	h := &DocumentHandler{documents: newDocMock()}
	r := newTestRouter()
	r.PUT("/documents/:id/summary", withUserID("u1"), h.UpdateSummary)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/documents/d1/summary", summaryUpdateRequest{})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_Pin_Success(t *testing.T) {
	mock := newDocMock()
	mock.updatePinnedFn = func(_ context.Context, _, _ string, pinned int) error {
		assert.Equal(t, 1, pinned)
		return nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.PUT("/documents/:id/pin", withUserID("u1"), h.Pin)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/documents/d1/pin", pinRequest{Pinned: true})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_Star_Success(t *testing.T) {
	mock := newDocMock()
	mock.updateStarredFn = func(_ context.Context, _, _ string, starred int) error {
		assert.Equal(t, 1, starred)
		return nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.PUT("/documents/:id/star", withUserID("u1"), h.Star)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/documents/d1/star", starRequest{Starred: true})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_Delete_Success(t *testing.T) {
	mock := newDocMock()
	mock.deleteFn = func(_ context.Context, _, _ string) error { return nil }
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.DELETE("/documents/:id", withUserID("u1"), h.Delete)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/documents/d1", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_Summary_Success(t *testing.T) {
	mock := newDocMock()
	mock.summaryFn = func(_ context.Context, _ string, _ uint) (*service.DocumentSummary, error) {
		return &service.DocumentSummary{
			Recent: []model.Document{{ID: "d1"}},
			Total:  5, StarredTotal: 2,
			TagCounts: map[string]int{"t1": 3},
		}, nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents/summary", withUserID("u1"), h.Summary)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/summary", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_Summary_WithLimit(t *testing.T) {
	mock := newDocMock()
	mock.summaryFn = func(_ context.Context, _ string, limit uint) (*service.DocumentSummary, error) {
		assert.Equal(t, uint(10), limit)
		return &service.DocumentSummary{TagCounts: map[string]int{}}, nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents/summary", withUserID("u1"), h.Summary)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/summary?limit=10", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_Backlinks_Success(t *testing.T) {
	mock := newDocMock()
	mock.getBacklinksFn = func(_ context.Context, _, _ string) ([]model.Document, error) {
		return []model.Document{{ID: "d2", Title: "Linker"}}, nil
	}
	mock.listTagIDsByDocIDsFn = func(_ context.Context, _ string, _ []string) (map[string][]string, error) {
		return map[string][]string{"d2": {"t1"}}, nil
	}
	mock.listTagsByIDsFn = func(_ context.Context, _ string, _ []string) ([]model.Tag, error) {
		return []model.Tag{{ID: "t1", Name: "Go"}}, nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents/:id/backlinks", withUserID("u1"), h.Backlinks)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/d1/backlinks", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_Backlinks_Empty(t *testing.T) {
	mock := newDocMock()
	mock.getBacklinksFn = func(_ context.Context, _, _ string) ([]model.Document, error) {
		return []model.Document{}, nil
	}
	mock.listTagIDsByDocIDsFn = func(_ context.Context, _ string, _ []string) (map[string][]string, error) {
		return map[string][]string{}, nil
	}
	mock.listTagsByIDsFn = func(_ context.Context, _ string, _ []string) ([]model.Tag, error) {
		return []model.Tag{}, nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents/:id/backlinks", withUserID("u1"), h.Backlinks)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/d1/backlinks", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_Create_WithSummary(t *testing.T) {
	mock := newDocMock()
	mock.createFn = func(_ context.Context, _ string, input service.DocumentCreateInput) (*model.Document, error) {
		assert.Equal(t, "my summary", input.Summary)
		return &model.Document{ID: "d1"}, nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.POST("/documents", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	s := "my summary"
	req := jsonRequestT(t, "POST", "/documents", documentRequest{Title: "T", Summary: &s})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_Create_ServiceError(t *testing.T) {
	mock := newDocMock()
	mock.createFn = func(_ context.Context, _ string, _ service.DocumentCreateInput) (*model.Document, error) {
		return nil, errors.New("db error")
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.POST("/documents", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/documents", documentRequest{Title: "T"})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_Create_InvalidJSON(t *testing.T) {
	h := &DocumentHandler{documents: newDocMock()}
	r := newTestRouter()
	r.POST("/documents", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/documents", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_List_WithStarredAndOrder(t *testing.T) {
	mock := newDocMock()
	mock.searchFn = func(_ context.Context, _, _, _ string, starred *int, _, _ uint, orderBy string) ([]model.Document, error) {
		assert.NotNil(t, starred)
		assert.Equal(t, 1, *starred)
		assert.Equal(t, "mtime desc", orderBy)
		return []model.Document{}, nil
	}
	mock.listTagIDsByDocIDsFn = func(_ context.Context, _ string, _ []string) (map[string][]string, error) {
		return map[string][]string{}, nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents?starred=1&order=mtime&limit=10&offset=5", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_List_SearchError(t *testing.T) {
	mock := newDocMock()
	mock.searchFn = func(_ context.Context, _, _, _ string, _ *int, _, _ uint, _ string) ([]model.Document, error) {
		return nil, errors.New("db error")
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_List_TagMapError(t *testing.T) {
	mock := newDocMock()
	mock.searchFn = func(_ context.Context, _, _, _ string, _ *int, _, _ uint, _ string) ([]model.Document, error) {
		return []model.Document{{ID: "d1"}}, nil
	}
	mock.listTagIDsByDocIDsFn = func(_ context.Context, _ string, _ []string) (map[string][]string, error) {
		return nil, errors.New("tag error")
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_List_IncludeTagsError(t *testing.T) {
	mock := newDocMock()
	mock.searchFn = func(_ context.Context, _, _, _ string, _ *int, _, _ uint, _ string) ([]model.Document, error) {
		return []model.Document{{ID: "d1"}}, nil
	}
	mock.listTagIDsByDocIDsFn = func(_ context.Context, _ string, _ []string) (map[string][]string, error) {
		return map[string][]string{"d1": {"t1"}}, nil
	}
	mock.listTagsByIDsFn = func(_ context.Context, _ string, _ []string) ([]model.Tag, error) {
		return nil, errors.New("tag fetch error")
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents?include=tags", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_List_IncludeTagsEmptyMap(t *testing.T) {
	mock := newDocMock()
	mock.searchFn = func(_ context.Context, _, _, _ string, _ *int, _, _ uint, _ string) ([]model.Document, error) {
		return []model.Document{{ID: "d1"}}, nil
	}
	mock.listTagIDsByDocIDsFn = func(_ context.Context, _ string, _ []string) (map[string][]string, error) {
		return map[string][]string{}, nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents?include=tags", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_Get_ListTagIDsError(t *testing.T) {
	mock := newDocMock()
	mock.getFn = func(_ context.Context, _, _ string) (*model.Document, error) {
		return &model.Document{ID: "d1"}, nil
	}
	mock.listTagIDsFn = func(_ context.Context, _, _ string) ([]string, error) {
		return nil, errors.New("tag error")
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents/:id", withUserID("u1"), h.Get)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/d1", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_Get_IncludeTagsWithEmptyTagIDs(t *testing.T) {
	mock := newDocMock()
	mock.getFn = func(_ context.Context, _, _ string) (*model.Document, error) {
		return &model.Document{ID: "d1"}, nil
	}
	mock.listTagIDsFn = func(_ context.Context, _, _ string) ([]string, error) {
		return []string{}, nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents/:id", withUserID("u1"), h.Get)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/d1?include=tags", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_Get_IncludeTagsListError(t *testing.T) {
	mock := newDocMock()
	mock.getFn = func(_ context.Context, _, _ string) (*model.Document, error) {
		return &model.Document{ID: "d1"}, nil
	}
	mock.listTagIDsFn = func(_ context.Context, _, _ string) ([]string, error) {
		return []string{"t1"}, nil
	}
	mock.listTagsByIDsFn = func(_ context.Context, _ string, _ []string) ([]model.Tag, error) {
		return nil, errors.New("list tags error")
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents/:id", withUserID("u1"), h.Get)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/d1?include=tags", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_Update_ServiceError(t *testing.T) {
	mock := newDocMock()
	mock.updateFn = func(_ context.Context, _, _ string, _ service.DocumentUpdateInput) error {
		return errors.New("update failed")
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.PUT("/documents/:id", withUserID("u1"), h.Update)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/documents/d1", documentRequest{Title: "T"})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_Update_WithTagIDs(t *testing.T) {
	mock := newDocMock()
	mock.updateFn = func(_ context.Context, _, _ string, input service.DocumentUpdateInput) error {
		assert.Equal(t, []string{"t1", "t2"}, input.TagIDs)
		return nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.PUT("/documents/:id", withUserID("u1"), h.Update)

	w := httptest.NewRecorder()
	tags := []string{"t1", "t2"}
	req := jsonRequestT(t, "PUT", "/documents/d1", documentRequest{Title: "T", TagIDs: &tags})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_Update_InvalidJSON(t *testing.T) {
	h := &DocumentHandler{documents: newDocMock()}
	r := newTestRouter()
	r.PUT("/documents/:id", withUserID("u1"), h.Update)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("PUT", "/documents/d1", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_UpdateTags_ServiceError(t *testing.T) {
	mock := newDocMock()
	mock.updateTagsFn = func(_ context.Context, _, _ string, _ []string) error {
		return errors.New("tag update error")
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.PUT("/documents/:id/tags", withUserID("u1"), h.UpdateTags)

	w := httptest.NewRecorder()
	tags := []string{"t1"}
	req := jsonRequestT(t, "PUT", "/documents/d1/tags", tagUpdateRequest{TagIDs: &tags})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_UpdateSummary_ServiceError(t *testing.T) {
	mock := newDocMock()
	mock.updateSummaryFn = func(_ context.Context, _, _, _ string) error {
		return errors.New("summary update error")
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.PUT("/documents/:id/summary", withUserID("u1"), h.UpdateSummary)

	w := httptest.NewRecorder()
	s := "summary"
	req := jsonRequestT(t, "PUT", "/documents/d1/summary", summaryUpdateRequest{Summary: &s})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_Pin_Unpin(t *testing.T) {
	mock := newDocMock()
	mock.updatePinnedFn = func(_ context.Context, _, _ string, pinned int) error {
		assert.Equal(t, 0, pinned)
		return nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.PUT("/documents/:id/pin", withUserID("u1"), h.Pin)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/documents/d1/pin", pinRequest{Pinned: false})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_Pin_ServiceError(t *testing.T) {
	mock := newDocMock()
	mock.updatePinnedFn = func(_ context.Context, _, _ string, _ int) error {
		return errors.New("pin error")
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.PUT("/documents/:id/pin", withUserID("u1"), h.Pin)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/documents/d1/pin", pinRequest{Pinned: true})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_Star_Unstar(t *testing.T) {
	mock := newDocMock()
	mock.updateStarredFn = func(_ context.Context, _, _ string, starred int) error {
		assert.Equal(t, 0, starred)
		return nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.PUT("/documents/:id/star", withUserID("u1"), h.Star)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/documents/d1/star", starRequest{Starred: false})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_Star_ServiceError(t *testing.T) {
	mock := newDocMock()
	mock.updateStarredFn = func(_ context.Context, _, _ string, _ int) error {
		return errors.New("star error")
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.PUT("/documents/:id/star", withUserID("u1"), h.Star)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/documents/d1/star", starRequest{Starred: true})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_Delete_Error(t *testing.T) {
	mock := newDocMock()
	mock.deleteFn = func(_ context.Context, _, _ string) error { return errors.New("delete error") }
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.DELETE("/documents/:id", withUserID("u1"), h.Delete)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/documents/d1", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_Summary_Error(t *testing.T) {
	mock := newDocMock()
	mock.summaryFn = func(_ context.Context, _ string, _ uint) (*service.DocumentSummary, error) {
		return nil, errors.New("summary error")
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents/summary", withUserID("u1"), h.Summary)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/summary", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_Backlinks_GetBacklinksError(t *testing.T) {
	mock := newDocMock()
	mock.getBacklinksFn = func(_ context.Context, _, _ string) ([]model.Document, error) {
		return nil, errors.New("backlinks error")
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents/:id/backlinks", withUserID("u1"), h.Backlinks)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/d1/backlinks", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_Backlinks_TagMapError(t *testing.T) {
	mock := newDocMock()
	mock.getBacklinksFn = func(_ context.Context, _, _ string) ([]model.Document, error) {
		return []model.Document{{ID: "d2"}}, nil
	}
	mock.listTagIDsByDocIDsFn = func(_ context.Context, _ string, _ []string) (map[string][]string, error) {
		return nil, errors.New("tag map error")
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents/:id/backlinks", withUserID("u1"), h.Backlinks)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/d1/backlinks", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_Backlinks_ListTagsError(t *testing.T) {
	mock := newDocMock()
	mock.getBacklinksFn = func(_ context.Context, _, _ string) ([]model.Document, error) {
		return []model.Document{{ID: "d2"}}, nil
	}
	mock.listTagIDsByDocIDsFn = func(_ context.Context, _ string, _ []string) (map[string][]string, error) {
		return map[string][]string{"d2": {"t1"}}, nil
	}
	mock.listTagsByIDsFn = func(_ context.Context, _ string, _ []string) ([]model.Tag, error) {
		return nil, errors.New("list tags error")
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents/:id/backlinks", withUserID("u1"), h.Backlinks)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/d1/backlinks", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_Pin_InvalidJSON(t *testing.T) {
	h := &DocumentHandler{documents: newDocMock()}
	r := newTestRouter()
	r.PUT("/documents/:id/pin", withUserID("u1"), h.Pin)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("PUT", "/documents/d1/pin", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_Star_InvalidJSON(t *testing.T) {
	h := &DocumentHandler{documents: newDocMock()}
	r := newTestRouter()
	r.PUT("/documents/:id/star", withUserID("u1"), h.Star)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("PUT", "/documents/d1/star", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_UpdateTags_InvalidJSON(t *testing.T) {
	h := &DocumentHandler{documents: newDocMock()}
	r := newTestRouter()
	r.PUT("/documents/:id/tags", withUserID("u1"), h.UpdateTags)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("PUT", "/documents/d1/tags", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_UpdateSummary_InvalidJSON(t *testing.T) {
	h := &DocumentHandler{documents: newDocMock()}
	r := newTestRouter()
	r.PUT("/documents/:id/summary", withUserID("u1"), h.UpdateSummary)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("PUT", "/documents/d1/summary", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestDocumentHandler_Summary_InvalidLimit(t *testing.T) {
	mock := newDocMock()
	mock.summaryFn = func(_ context.Context, _ string, limit uint) (*service.DocumentSummary, error) {
		assert.Equal(t, uint(5), limit)
		return &service.DocumentSummary{TagCounts: map[string]int{}}, nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents/summary", withUserID("u1"), h.Summary)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/summary?limit=abc", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_List_IncludeNonTags(t *testing.T) {
	mock := newDocMock()
	mock.searchFn = func(_ context.Context, _, _, _ string, _ *int, _, _ uint, _ string) ([]model.Document, error) {
		return []model.Document{{ID: "d1"}}, nil
	}
	mock.listTagIDsByDocIDsFn = func(_ context.Context, _ string, _ []string) (map[string][]string, error) {
		return map[string][]string{}, nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents?include=other,stuff", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestDocumentHandler_Get_IncludeNonTags(t *testing.T) {
	mock := newDocMock()
	mock.getFn = func(_ context.Context, _, _ string) (*model.Document, error) {
		return &model.Document{ID: "d1"}, nil
	}
	mock.listTagIDsFn = func(_ context.Context, _, _ string) ([]string, error) {
		return []string{}, nil
	}
	h := &DocumentHandler{documents: mock}
	r := newTestRouter()
	r.GET("/documents/:id", withUserID("u1"), h.Get)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/documents/d1?include=other", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}
