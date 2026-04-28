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

func TestTemplateHandler_List_Success(t *testing.T) {
	mock := &mockTemplateHandlerService{
		listFn: func(_ context.Context, _ string) ([]model.Template, error) {
			return []model.Template{{ID: "tpl1", Name: "Daily"}}, nil
		},
	}
	h := &TemplateHandler{templates: mock}
	r := newTestRouter()
	r.GET("/templates", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/templates", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTemplateHandler_ListMeta_Default(t *testing.T) {
	mock := &mockTemplateHandlerService{
		listMetaFn: func(_ context.Context, _ string, limit, offset int) (*service.TemplateMetaListResult, error) {
			assert.Equal(t, 20, limit)
			assert.Equal(t, 0, offset)
			return &service.TemplateMetaListResult{Items: []model.TemplateMeta{}, Total: 0}, nil
		},
	}
	h := &TemplateHandler{templates: mock}
	r := newTestRouter()
	r.GET("/templates/meta", withUserID("u1"), h.ListMeta)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/templates/meta", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTemplateHandler_ListMeta_InvalidLimit(t *testing.T) {
	h := &TemplateHandler{templates: &mockTemplateHandlerService{}}
	r := newTestRouter()
	r.GET("/templates/meta", withUserID("u1"), h.ListMeta)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/templates/meta?limit=abc", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTemplateHandler_Get_Success(t *testing.T) {
	mock := &mockTemplateHandlerService{
		getFn: func(_ context.Context, _, id string) (*model.Template, error) {
			return &model.Template{ID: id, Name: "Daily"}, nil
		},
	}
	h := &TemplateHandler{templates: mock}
	r := newTestRouter()
	r.GET("/templates/:id", withUserID("u1"), h.Get)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/templates/tpl1", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTemplateHandler_Create_Success(t *testing.T) {
	mock := &mockTemplateHandlerService{
		createFn: func(_ context.Context, _ string, input service.CreateTemplateInput) (*model.Template, error) {
			return &model.Template{ID: "tpl1", Name: input.Name, Content: input.Content}, nil
		},
	}
	h := &TemplateHandler{templates: mock}
	r := newTestRouter()
	r.POST("/templates", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/templates", templateRequest{
		Name: "Daily", Content: "# Daily Note", Description: "A daily note template",
	})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTemplateHandler_Create_Error(t *testing.T) {
	mock := &mockTemplateHandlerService{
		createFn: func(_ context.Context, _ string, _ service.CreateTemplateInput) (*model.Template, error) {
			return nil, errors.New("invalid")
		},
	}
	h := &TemplateHandler{templates: mock}
	r := newTestRouter()
	r.POST("/templates", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/templates", templateRequest{Name: "T"})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTemplateHandler_Update_Success(t *testing.T) {
	mock := &mockTemplateHandlerService{
		updateFn: func(_ context.Context, _, id string, _ service.UpdateTemplateInput) error {
			assert.Equal(t, "tpl1", id)
			return nil
		},
	}
	h := &TemplateHandler{templates: mock}
	r := newTestRouter()
	r.PUT("/templates/:id", withUserID("u1"), h.Update)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/templates/tpl1", templateRequest{Name: "Updated", Content: "content"})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTemplateHandler_Delete_Success(t *testing.T) {
	mock := &mockTemplateHandlerService{
		deleteFn: func(_ context.Context, _, _ string) error { return nil },
	}
	h := &TemplateHandler{templates: mock}
	r := newTestRouter()
	r.DELETE("/templates/:id", withUserID("u1"), h.Delete)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/templates/tpl1", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTemplateHandler_CreateDocument_Success(t *testing.T) {
	mock := &mockTemplateHandlerService{
		createDocFn: func(_ context.Context, _ string, _ service.CreateDocumentFromTemplateInput) (*model.Document, error) {
			return &model.Document{ID: "d1", Title: "From Template"}, nil
		},
	}
	h := &TemplateHandler{templates: mock}
	r := newTestRouter()
	r.POST("/templates/:id/create", withUserID("u1"), h.CreateDocument)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/templates/tpl1/create", createDocumentFromTemplateRequest{
		Title: "My Doc", Variables: map[string]string{"NAME": "test"},
	})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTemplateHandler_List_Error(t *testing.T) {
	mock := &mockTemplateHandlerService{
		listFn: func(_ context.Context, _ string) ([]model.Template, error) {
			return nil, errors.New("list error")
		},
	}
	h := &TemplateHandler{templates: mock}
	r := newTestRouter()
	r.GET("/templates", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/templates", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTemplateHandler_ListMeta_WithParams(t *testing.T) {
	mock := &mockTemplateHandlerService{
		listMetaFn: func(_ context.Context, _ string, limit, offset int) (*service.TemplateMetaListResult, error) {
			assert.Equal(t, 10, limit)
			assert.Equal(t, 5, offset)
			return &service.TemplateMetaListResult{Items: []model.TemplateMeta{}, Total: 0}, nil
		},
	}
	h := &TemplateHandler{templates: mock}
	r := newTestRouter()
	r.GET("/templates/meta", withUserID("u1"), h.ListMeta)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/templates/meta?limit=10&offset=5", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTemplateHandler_ListMeta_InvalidOffset(t *testing.T) {
	h := &TemplateHandler{templates: &mockTemplateHandlerService{}}
	r := newTestRouter()
	r.GET("/templates/meta", withUserID("u1"), h.ListMeta)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/templates/meta?offset=abc", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTemplateHandler_ListMeta_Error(t *testing.T) {
	mock := &mockTemplateHandlerService{
		listMetaFn: func(_ context.Context, _ string, _, _ int) (*service.TemplateMetaListResult, error) {
			return nil, errors.New("list meta error")
		},
	}
	h := &TemplateHandler{templates: mock}
	r := newTestRouter()
	r.GET("/templates/meta", withUserID("u1"), h.ListMeta)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/templates/meta", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTemplateHandler_Get_Error(t *testing.T) {
	mock := &mockTemplateHandlerService{
		getFn: func(_ context.Context, _, _ string) (*model.Template, error) {
			return nil, errors.New("not found")
		},
	}
	h := &TemplateHandler{templates: mock}
	r := newTestRouter()
	r.GET("/templates/:id", withUserID("u1"), h.Get)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/templates/tpl1", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTemplateHandler_Create_InvalidJSON(t *testing.T) {
	h := &TemplateHandler{templates: &mockTemplateHandlerService{}}
	r := newTestRouter()
	r.POST("/templates", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/templates", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTemplateHandler_Update_Error(t *testing.T) {
	mock := &mockTemplateHandlerService{
		updateFn: func(_ context.Context, _, _ string, _ service.UpdateTemplateInput) error {
			return errors.New("update error")
		},
	}
	h := &TemplateHandler{templates: mock}
	r := newTestRouter()
	r.PUT("/templates/:id", withUserID("u1"), h.Update)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/templates/tpl1", templateRequest{Name: "T"})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTemplateHandler_Update_InvalidJSON(t *testing.T) {
	h := &TemplateHandler{templates: &mockTemplateHandlerService{}}
	r := newTestRouter()
	r.PUT("/templates/:id", withUserID("u1"), h.Update)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("PUT", "/templates/tpl1", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTemplateHandler_Delete_Error(t *testing.T) {
	mock := &mockTemplateHandlerService{
		deleteFn: func(_ context.Context, _, _ string) error {
			return errors.New("delete error")
		},
	}
	h := &TemplateHandler{templates: mock}
	r := newTestRouter()
	r.DELETE("/templates/:id", withUserID("u1"), h.Delete)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/templates/tpl1", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTemplateHandler_CreateDocument_InvalidJSON(t *testing.T) {
	h := &TemplateHandler{templates: &mockTemplateHandlerService{}}
	r := newTestRouter()
	r.POST("/templates/:id/create", withUserID("u1"), h.CreateDocument)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/templates/tpl1/create", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTemplateHandler_CreateDocument_Error(t *testing.T) {
	mock := &mockTemplateHandlerService{
		createDocFn: func(_ context.Context, _ string, _ service.CreateDocumentFromTemplateInput) (*model.Document, error) {
			return nil, errors.New("template not found")
		},
	}
	h := &TemplateHandler{templates: mock}
	r := newTestRouter()
	r.POST("/templates/:id/create", withUserID("u1"), h.CreateDocument)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/templates/tpl1/create", createDocumentFromTemplateRequest{})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}
