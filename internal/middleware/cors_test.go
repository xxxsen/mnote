package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func newTestRequest(method string) *http.Request {
	return httptest.NewRequestWithContext(context.Background(), method, "/", nil)
}

func init() {
	gin.SetMode(gin.TestMode)
}

func TestCORS_AllowAll(t *testing.T) {
	handler := CORS(nil)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = newTestRequest("GET")
	c.Request.Header.Set("Origin", "https://example.com")

	handler(c)

	assert.Equal(t, "*", w.Header().Get("Access-Control-Allow-Origin"))
	assert.Contains(t, w.Header().Get("Access-Control-Allow-Methods"), "GET")
}

func TestCORS_AllowList_Matched(t *testing.T) {
	handler := CORS([]string{"https://a.com", "https://b.com"})
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = newTestRequest("GET")
	c.Request.Header.Set("Origin", "https://a.com")

	handler(c)

	assert.Equal(t, "https://a.com", w.Header().Get("Access-Control-Allow-Origin"))
	assert.Equal(t, "Origin", w.Header().Get("Vary"))
}

func TestCORS_AllowList_NotMatched(t *testing.T) {
	handler := CORS([]string{"https://a.com"})
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = newTestRequest("GET")
	c.Request.Header.Set("Origin", "https://evil.com")

	handler(c)

	assert.Empty(t, w.Header().Get("Access-Control-Allow-Origin"))
}

func TestCORS_Options_Preflight(t *testing.T) {
	handler := CORS(nil)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = newTestRequest("OPTIONS")

	handler(c)

	assert.Equal(t, http.StatusNoContent, w.Code)
	assert.True(t, c.IsAborted())
}

func TestCORS_EmptyOriginStrings(t *testing.T) {
	handler := CORS([]string{"", "  ", "https://valid.com"})
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = newTestRequest("GET")
	c.Request.Header.Set("Origin", "https://valid.com")

	handler(c)

	assert.Equal(t, "https://valid.com", w.Header().Get("Access-Control-Allow-Origin"))
}
