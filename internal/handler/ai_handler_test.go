package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/xxxsen/mnote/internal/ai"
	"github.com/xxxsen/mnote/internal/model"
)

func TestAIHandler_Polish_Success(t *testing.T) {
	mock := &mockAIHandlerService{
		polishFn: func(_ context.Context, input string) (string, error) {
			return "polished: " + input, nil
		},
	}
	h := &AIHandler{ai: mock, documents: newDocMock(), tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/ai/polish", withUserID("u1"), h.Polish)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/ai/polish", aiPolishRequest{Text: "rough text"})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAIHandler_Polish_Unavailable(t *testing.T) {
	mock := &mockAIHandlerService{
		polishFn: func(_ context.Context, _ string) (string, error) {
			return "", ai.ErrUnavailable
		},
	}
	h := &AIHandler{ai: mock, documents: newDocMock(), tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/ai/polish", withUserID("u1"), h.Polish)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/ai/polish", aiPolishRequest{Text: "text"})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAIHandler_Generate_Success(t *testing.T) {
	mock := &mockAIHandlerService{
		generateFn: func(_ context.Context, _ string) (string, error) {
			return "generated content", nil
		},
	}
	h := &AIHandler{ai: mock, documents: newDocMock(), tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/ai/generate", withUserID("u1"), h.Generate)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/ai/generate", aiGenerateRequest{Prompt: "write something"})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAIHandler_Generate_Unavailable(t *testing.T) {
	mock := &mockAIHandlerService{
		generateFn: func(_ context.Context, _ string) (string, error) {
			return "", ai.ErrUnavailable
		},
	}
	h := &AIHandler{ai: mock, documents: newDocMock(), tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/ai/generate", withUserID("u1"), h.Generate)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/ai/generate", aiGenerateRequest{Prompt: "prompt"})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAIHandler_Summary_Success(t *testing.T) {
	mock := &mockAIHandlerService{
		summarizeFn: func(_ context.Context, _ string) (string, error) {
			return "summary text", nil
		},
	}
	h := &AIHandler{ai: mock, documents: newDocMock(), tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/ai/summary", withUserID("u1"), h.Summary)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/ai/summary", aiSummaryRequest{Text: "long text"})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAIHandler_Tags_Success(t *testing.T) {
	aiMock := &mockAIHandlerService{
		extractTagsFn: func(_ context.Context, _ string, _ int) ([]string, error) {
			return []string{"Go", "AI"}, nil
		},
	}
	docMock := newDocMock()
	docMock.listTagIDsFn = func(_ context.Context, _, _ string) ([]string, error) {
		return []string{"t1"}, nil
	}
	tagMock := &mockTagService{
		listByIDsFn: func(_ context.Context, _ string, _ []string) ([]model.Tag, error) {
			return []model.Tag{{ID: "t1", Name: "Existing"}}, nil
		},
	}
	h := &AIHandler{ai: aiMock, documents: docMock, tags: tagMock}
	r := newTestRouter()
	r.POST("/ai/tags", withUserID("u1"), h.Tags)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/ai/tags", aiTagsRequest{
		Text: "Go and AI content", MaxTags: 5, DocumentID: "d1",
	})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAIHandler_Tags_NoDocumentID(t *testing.T) {
	aiMock := &mockAIHandlerService{
		extractTagsFn: func(_ context.Context, _ string, _ int) ([]string, error) {
			return []string{"Go"}, nil
		},
	}
	h := &AIHandler{ai: aiMock, documents: newDocMock(), tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/ai/tags", withUserID("u1"), h.Tags)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/ai/tags", aiTagsRequest{Text: "text"})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAIHandler_Search_Success(t *testing.T) {
	docMock := newDocMock()
	docMock.semanticSearchFn = func(_ context.Context, _, query, _ string, _ *int, _, _ uint, _, _ string) ([]model.Document, []float32, error) {
		return []model.Document{{ID: "d1", Title: "Match"}}, []float32{0.95}, nil
	}
	h := &AIHandler{ai: &mockAIHandlerService{}, documents: docMock, tags: &mockTagService{}}
	r := newTestRouter()
	r.GET("/ai/search", withUserID("u1"), h.Search)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/ai/search?q=test&limit=4", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAIHandler_Search_EmptyQuery(t *testing.T) {
	h := &AIHandler{ai: &mockAIHandlerService{}, documents: newDocMock(), tags: &mockTagService{}}
	r := newTestRouter()
	r.GET("/ai/search", withUserID("u1"), h.Search)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/ai/search", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAIHandler_Search_NoResults(t *testing.T) {
	docMock := newDocMock()
	docMock.semanticSearchFn = func(_ context.Context, _, _, _ string, _ *int, _, _ uint, _, _ string) ([]model.Document, []float32, error) {
		return []model.Document{}, []float32{}, nil
	}
	h := &AIHandler{ai: &mockAIHandlerService{}, documents: docMock, tags: &mockTagService{}}
	r := newTestRouter()
	r.GET("/ai/search", withUserID("u1"), h.Search)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/ai/search?q=nothing", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAIHandler_Search_Error(t *testing.T) {
	docMock := newDocMock()
	docMock.semanticSearchFn = func(_ context.Context, _, _, _ string, _ *int, _, _ uint, _, _ string) ([]model.Document, []float32, error) {
		return nil, nil, errors.New("embedding failed")
	}
	h := &AIHandler{ai: &mockAIHandlerService{}, documents: docMock, tags: &mockTagService{}}
	r := newTestRouter()
	r.GET("/ai/search", withUserID("u1"), h.Search)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/ai/search?q=test", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAIHandler_Generate_OtherError(t *testing.T) {
	mock := &mockAIHandlerService{
		generateFn: func(_ context.Context, _ string) (string, error) {
			return "", errors.New("generate error")
		},
	}
	h := &AIHandler{ai: mock, documents: newDocMock(), tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/ai/generate", withUserID("u1"), h.Generate)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/ai/generate", aiGenerateRequest{Prompt: "p"})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAIHandler_Summary_Unavailable(t *testing.T) {
	mock := &mockAIHandlerService{
		summarizeFn: func(_ context.Context, _ string) (string, error) {
			return "", ai.ErrUnavailable
		},
	}
	h := &AIHandler{ai: mock, documents: newDocMock(), tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/ai/summary", withUserID("u1"), h.Summary)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/ai/summary", aiSummaryRequest{Text: "t"})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAIHandler_Summary_OtherError(t *testing.T) {
	mock := &mockAIHandlerService{
		summarizeFn: func(_ context.Context, _ string) (string, error) {
			return "", errors.New("summary error")
		},
	}
	h := &AIHandler{ai: mock, documents: newDocMock(), tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/ai/summary", withUserID("u1"), h.Summary)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/ai/summary", aiSummaryRequest{Text: "t"})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAIHandler_Tags_Unavailable(t *testing.T) {
	mock := &mockAIHandlerService{
		extractTagsFn: func(_ context.Context, _ string, _ int) ([]string, error) {
			return nil, ai.ErrUnavailable
		},
	}
	h := &AIHandler{ai: mock, documents: newDocMock(), tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/ai/tags", withUserID("u1"), h.Tags)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/ai/tags", aiTagsRequest{Text: "t"})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAIHandler_Tags_OtherError(t *testing.T) {
	mock := &mockAIHandlerService{
		extractTagsFn: func(_ context.Context, _ string, _ int) ([]string, error) {
			return nil, errors.New("tags error")
		},
	}
	h := &AIHandler{ai: mock, documents: newDocMock(), tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/ai/tags", withUserID("u1"), h.Tags)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/ai/tags", aiTagsRequest{Text: "t"})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAIHandler_Tags_FetchExistingTagsError(t *testing.T) {
	aiMock := &mockAIHandlerService{
		extractTagsFn: func(_ context.Context, _ string, _ int) ([]string, error) {
			return []string{"Go"}, nil
		},
	}
	docMock := newDocMock()
	docMock.listTagIDsFn = func(_ context.Context, _, _ string) ([]string, error) {
		return nil, errors.New("list tag ids error")
	}
	h := &AIHandler{ai: aiMock, documents: docMock, tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/ai/tags", withUserID("u1"), h.Tags)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/ai/tags", aiTagsRequest{Text: "t", DocumentID: "d1"})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAIHandler_Tags_EmptyExistingTagIDs(t *testing.T) {
	aiMock := &mockAIHandlerService{
		extractTagsFn: func(_ context.Context, _ string, _ int) ([]string, error) {
			return []string{"Go"}, nil
		},
	}
	docMock := newDocMock()
	docMock.listTagIDsFn = func(_ context.Context, _, _ string) ([]string, error) {
		return []string{}, nil
	}
	h := &AIHandler{ai: aiMock, documents: docMock, tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/ai/tags", withUserID("u1"), h.Tags)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/ai/tags", aiTagsRequest{Text: "t", DocumentID: "d1"})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAIHandler_Tags_ListByIDsError(t *testing.T) {
	aiMock := &mockAIHandlerService{
		extractTagsFn: func(_ context.Context, _ string, _ int) ([]string, error) {
			return []string{"Go"}, nil
		},
	}
	docMock := newDocMock()
	docMock.listTagIDsFn = func(_ context.Context, _, _ string) ([]string, error) {
		return []string{"t1"}, nil
	}
	tagMock := &mockTagService{
		listByIDsFn: func(_ context.Context, _ string, _ []string) ([]model.Tag, error) {
			return nil, errors.New("list by ids error")
		},
	}
	h := &AIHandler{ai: aiMock, documents: docMock, tags: tagMock}
	r := newTestRouter()
	r.POST("/ai/tags", withUserID("u1"), h.Tags)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/ai/tags", aiTagsRequest{Text: "t", DocumentID: "d1"})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAIHandler_Search_LimitNegative(t *testing.T) {
	docMock := newDocMock()
	docMock.semanticSearchFn = func(_ context.Context, _, _, _ string, _ *int, limit, _ uint, _, _ string) ([]model.Document, []float32, error) {
		assert.Equal(t, uint(20), limit)
		return []model.Document{}, []float32{}, nil
	}
	h := &AIHandler{ai: &mockAIHandlerService{}, documents: docMock, tags: &mockTagService{}}
	r := newTestRouter()
	r.GET("/ai/search", withUserID("u1"), h.Search)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/ai/search?q=test&limit=-1", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAIHandler_Search_WithExcludeID(t *testing.T) {
	docMock := newDocMock()
	docMock.semanticSearchFn = func(_ context.Context, _, _, _ string, _ *int, _, _ uint, _, excludeID string) ([]model.Document, []float32, error) {
		assert.Equal(t, "d1", excludeID)
		return []model.Document{{ID: "d2"}}, []float32{0.8}, nil
	}
	h := &AIHandler{ai: &mockAIHandlerService{}, documents: docMock, tags: &mockTagService{}}
	r := newTestRouter()
	r.GET("/ai/search", withUserID("u1"), h.Search)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/ai/search?q=test&exclude_id=d1", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAIHandler_Polish_InvalidJSON(t *testing.T) {
	h := &AIHandler{ai: &mockAIHandlerService{}, documents: newDocMock(), tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/ai/polish", withUserID("u1"), h.Polish)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/ai/polish", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAIHandler_Generate_InvalidJSON(t *testing.T) {
	h := &AIHandler{ai: &mockAIHandlerService{}, documents: newDocMock(), tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/ai/generate", withUserID("u1"), h.Generate)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/ai/generate", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAIHandler_Summary_InvalidJSON(t *testing.T) {
	h := &AIHandler{ai: &mockAIHandlerService{}, documents: newDocMock(), tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/ai/summary", withUserID("u1"), h.Summary)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/ai/summary", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAIHandler_Tags_InvalidJSON(t *testing.T) {
	h := &AIHandler{ai: &mockAIHandlerService{}, documents: newDocMock(), tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/ai/tags", withUserID("u1"), h.Tags)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/ai/tags", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestAIHandler_Search_ScoresFewerThanDocs(t *testing.T) {
	docMock := newDocMock()
	docMock.semanticSearchFn = func(_ context.Context, _, _, _ string, _ *int, _, _ uint, _, _ string) ([]model.Document, []float32, error) {
		return []model.Document{{ID: "d1"}, {ID: "d2"}}, []float32{0.9}, nil
	}
	h := &AIHandler{ai: &mockAIHandlerService{}, documents: docMock, tags: &mockTagService{}}
	r := newTestRouter()
	r.GET("/ai/search", withUserID("u1"), h.Search)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/ai/search?q=test", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAIHandler_Polish_OtherError(t *testing.T) {
	mock := &mockAIHandlerService{
		polishFn: func(_ context.Context, _ string) (string, error) {
			return "", errors.New("some other error")
		},
	}
	h := &AIHandler{ai: mock, documents: newDocMock(), tags: &mockTagService{}}
	r := newTestRouter()
	r.POST("/ai/polish", withUserID("u1"), h.Polish)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/ai/polish", aiPolishRequest{Text: "text"})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}
