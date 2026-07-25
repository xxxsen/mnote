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

func newSemanticSearchTestHandler(documents ISemanticSearchHandlerService) *SemanticSearchHandler {
	return NewSemanticSearchHandler(documents)
}

func TestSemanticSearchHandler_Search_Success(t *testing.T) {
	documents := newDocMock()
	documents.semanticSearchFn = func(
		_ context.Context, _, query, _ string, _ *int, _, _ uint, _, _ string,
	) ([]model.Document, []float32, error) {
		assert.Equal(t, "test", query)
		return []model.Document{{ID: "d1", Title: "Match"}}, []float32{0.95}, nil
	}
	handler := newSemanticSearchTestHandler(documents)
	router := newTestRouter()
	router.GET("/ai/search", withUserID("u1"), handler.Search)

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest("GET", "/ai/search?q=test&limit=4", nil))

	assert.Equal(t, http.StatusOK, recorder.Code)
}

func TestSemanticSearchHandler_Search_EmptyQuery(t *testing.T) {
	handler := newSemanticSearchTestHandler(newDocMock())
	router := newTestRouter()
	router.GET("/ai/search", withUserID("u1"), handler.Search)

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest("GET", "/ai/search", nil))

	response := parseResponseT(t, recorder)
	assert.NotEqual(t, float64(0), response["code"])
}

func TestSemanticSearchHandler_Search_NoResults(t *testing.T) {
	documents := newDocMock()
	documents.semanticSearchFn = func(
		_ context.Context, _, _, _ string, _ *int, _, _ uint, _, _ string,
	) ([]model.Document, []float32, error) {
		return []model.Document{}, []float32{}, nil
	}
	handler := newSemanticSearchTestHandler(documents)
	router := newTestRouter()
	router.GET("/ai/search", withUserID("u1"), handler.Search)

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest("GET", "/ai/search?q=nothing", nil))

	assert.Equal(t, http.StatusOK, recorder.Code)
}

func TestSemanticSearchHandler_Search_Error(t *testing.T) {
	documents := newDocMock()
	documents.semanticSearchFn = func(
		_ context.Context, _, _, _ string, _ *int, _, _ uint, _, _ string,
	) ([]model.Document, []float32, error) {
		return nil, nil, errors.New("embedding failed")
	}
	handler := newSemanticSearchTestHandler(documents)
	router := newTestRouter()
	router.GET("/ai/search", withUserID("u1"), handler.Search)

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest("GET", "/ai/search?q=test", nil))

	response := parseResponseT(t, recorder)
	assert.NotEqual(t, float64(0), response["code"])
}

func TestSemanticSearchHandler_Search_InvalidOffset(t *testing.T) {
	handler := newSemanticSearchTestHandler(newDocMock())
	router := newTestRouter()
	router.GET("/ai/search", withUserID("u1"), handler.Search)

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest("GET", "/ai/search?q=test&offset=1", nil))

	response := parseResponseT(t, recorder)
	assert.NotEqual(t, float64(0), response["code"])
}

func TestSemanticSearchHandler_Search_WithExcludeID(t *testing.T) {
	documents := newDocMock()
	documents.semanticSearchFn = func(
		_ context.Context, _, _, _ string, _ *int, _, _ uint, _, excludeID string,
	) ([]model.Document, []float32, error) {
		assert.Equal(t, "d1", excludeID)
		return []model.Document{{ID: "d2"}}, []float32{0.8}, nil
	}
	handler := newSemanticSearchTestHandler(documents)
	router := newTestRouter()
	router.GET("/ai/search", withUserID("u1"), handler.Search)

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest("GET", "/ai/search?q=test&exclude_id=d1", nil))

	assert.Equal(t, http.StatusOK, recorder.Code)
}

func TestSemanticSearchHandler_Search_ScoresFewerThanDocuments(t *testing.T) {
	documents := newDocMock()
	documents.semanticSearchFn = func(
		_ context.Context, _, _, _ string, _ *int, _, _ uint, _, _ string,
	) ([]model.Document, []float32, error) {
		return []model.Document{{ID: "d1"}, {ID: "d2"}}, []float32{0.9}, nil
	}
	handler := newSemanticSearchTestHandler(documents)
	router := newTestRouter()
	router.GET("/ai/search", withUserID("u1"), handler.Search)

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest("GET", "/ai/search?q=test", nil))

	assert.Equal(t, http.StatusOK, recorder.Code)
}
