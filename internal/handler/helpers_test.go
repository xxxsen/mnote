package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/service"
)

func TestHandleError_NilError(t *testing.T) {
	r := newTestRouter()
	r.GET("/test", func(c *gin.Context) {
		handleError(c, nil)
		c.Status(http.StatusOK)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestGetUserID_NoValue(t *testing.T) {
	r := newTestRouter()
	var result string
	r.GET("/test", func(c *gin.Context) {
		result = getUserID(c)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	assert.Empty(t, result)
}

func TestGetUserID_WithValue(t *testing.T) {
	r := newTestRouter()
	var result string
	r.GET("/test", withUserID("u123"), func(c *gin.Context) {
		result = getUserID(c)
	})

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/test", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, "u123", result)
}

func TestNewHandlerConstructors(t *testing.T) {
	t.Run("NewAIHandler", func(t *testing.T) {
		h := NewAIHandler(nil, nil, nil)
		require.NotNil(t, h)
	})
	t.Run("NewDocumentHandler", func(t *testing.T) {
		h := NewDocumentHandler(nil)
		require.NotNil(t, h)
	})
	t.Run("NewTagHandler", func(t *testing.T) {
		h := NewTagHandler(nil)
		require.NotNil(t, h)
	})
	t.Run("NewShareHandler", func(t *testing.T) {
		h := NewShareHandler(nil)
		require.NotNil(t, h)
	})
	t.Run("NewVersionHandler", func(t *testing.T) {
		h := NewVersionHandler(nil)
		require.NotNil(t, h)
	})
	t.Run("NewExportHandler", func(t *testing.T) {
		h := NewExportHandler(nil)
		require.NotNil(t, h)
	})
	t.Run("NewFileHandler", func(t *testing.T) {
		h := NewFileHandler(nil, 0)
		require.NotNil(t, h)
	})
	t.Run("NewImportHandler", func(t *testing.T) {
		h := NewImportHandler(nil, 0, nil)
		require.NotNil(t, h)
	})
	t.Run("NewTemplateHandler", func(t *testing.T) {
		h := NewTemplateHandler(nil)
		require.NotNil(t, h)
	})
	t.Run("NewTodoHandler", func(t *testing.T) {
		h := NewTodoHandler(nil)
		require.NotNil(t, h)
	})
	t.Run("NewAssetHandler", func(t *testing.T) {
		h := NewAssetHandler(nil)
		require.NotNil(t, h)
	})
	t.Run("NewOAuthHandler", func(t *testing.T) {
		h := NewOAuthHandler(nil)
		require.NotNil(t, h)
	})
	t.Run("NewSavedViewHandler", func(t *testing.T) {
		h := NewSavedViewHandler(nil)
		require.NotNil(t, h)
	})
	t.Run("NewAuthHandler", func(t *testing.T) {
		h := NewAuthHandler(nil)
		require.NotNil(t, h)
	})
	t.Run("NewPropertiesHandler", func(t *testing.T) {
		h := NewPropertiesHandler(Properties{}, BannerConfig{})
		require.NotNil(t, h)
	})
}

func TestNewTodoHandler_Integration(t *testing.T) {
	h := NewTodoHandler(&service.TodoService{})
	require.NotNil(t, h)
}
