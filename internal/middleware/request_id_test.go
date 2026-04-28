package middleware

import (
	"context"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestRequestID_GeneratesNew(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequestWithContext(context.Background(), "GET", "/", nil)

	RequestID()(c)

	reqID := w.Header().Get("X-Request-Id")
	assert.NotEmpty(t, reqID)
	assert.Len(t, reqID, 32)

	ctxVal, exists := c.Get("request_id")
	assert.True(t, exists)
	assert.Equal(t, reqID, ctxVal)
}

func TestRequestID_UsesExisting(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequestWithContext(context.Background(), "GET", "/", nil)
	c.Request.Header.Set("X-Request-Id", "custom-id-123")

	RequestID()(c)

	assert.Equal(t, "custom-id-123", w.Header().Get("X-Request-Id"))
	ctxVal, _ := c.Get("request_id")
	assert.Equal(t, "custom-id-123", ctxVal)
}

func TestRequestID_UniquePerRequest(t *testing.T) {
	ids := make(map[string]struct{})
	for range 100 {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		c.Request = httptest.NewRequestWithContext(context.Background(), "GET", "/", nil)
		RequestID()(c)
		ids[w.Header().Get("X-Request-Id")] = struct{}{}
	}
	assert.Len(t, ids, 100, "all request IDs should be unique")
}
