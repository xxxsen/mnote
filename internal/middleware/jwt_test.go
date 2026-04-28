package middleware

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/pkg/jwt"
)

var testJWTSecret = []byte("middleware-test-secret")

func TestJWTAuth_ValidToken(t *testing.T) {
	token, err := jwt.GenerateToken("user1", "u@test.com", testJWTSecret, time.Hour)
	require.NoError(t, err)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequestWithContext(context.Background(), "GET", "/", nil)
	c.Request.Header.Set("Authorization", "Bearer "+token)

	handler := JWTAuth(testJWTSecret)
	handler(c)

	assert.False(t, c.IsAborted())
	uid, exists := c.Get(ContextUserIDKey)
	assert.True(t, exists)
	assert.Equal(t, "user1", uid)
	email, _ := c.Get("user_email")
	assert.Equal(t, "u@test.com", email)
}

func TestJWTAuth_MissingHeader(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequestWithContext(context.Background(), "GET", "/", nil)

	JWTAuth(testJWTSecret)(c)

	assert.True(t, c.IsAborted())
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
}

func TestJWTAuth_InvalidFormat(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequestWithContext(context.Background(), "GET", "/", nil)
	c.Request.Header.Set("Authorization", "Token abc")

	JWTAuth(testJWTSecret)(c)

	assert.True(t, c.IsAborted())
}

func TestJWTAuth_ExpiredToken(t *testing.T) {
	token, err := jwt.GenerateToken("user1", "", testJWTSecret, -time.Hour)
	require.NoError(t, err)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequestWithContext(context.Background(), "GET", "/", nil)
	c.Request.Header.Set("Authorization", "Bearer "+token)

	JWTAuth(testJWTSecret)(c)

	assert.True(t, c.IsAborted())
}

func TestOptionalJWTAuth_NoHeader(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequestWithContext(context.Background(), "GET", "/", nil)

	OptionalJWTAuth(testJWTSecret)(c)

	assert.False(t, c.IsAborted())
	_, exists := c.Get(ContextUserIDKey)
	assert.False(t, exists)
}

func TestOptionalJWTAuth_ValidToken(t *testing.T) {
	token, err := jwt.GenerateToken("user2", "", testJWTSecret, time.Hour)
	require.NoError(t, err)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequestWithContext(context.Background(), "GET", "/", nil)
	c.Request.Header.Set("Authorization", "Bearer "+token)

	OptionalJWTAuth(testJWTSecret)(c)

	assert.False(t, c.IsAborted())
	uid, exists := c.Get(ContextUserIDKey)
	assert.True(t, exists)
	assert.Equal(t, "user2", uid)
}

func TestOptionalJWTAuth_InvalidToken(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequestWithContext(context.Background(), "GET", "/", nil)
	c.Request.Header.Set("Authorization", "Bearer invalid-token")

	OptionalJWTAuth(testJWTSecret)(c)

	assert.False(t, c.IsAborted(), "optional auth should not abort on invalid token")
	_, exists := c.Get(ContextUserIDKey)
	assert.False(t, exists)
}

func TestOptionalJWTAuth_BadFormat(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequestWithContext(context.Background(), "GET", "/", nil)
	c.Request.Header.Set("Authorization", "Basic abc123")

	OptionalJWTAuth(testJWTSecret)(c)

	assert.False(t, c.IsAborted())
	_, exists := c.Get(ContextUserIDKey)
	assert.False(t, exists)
}

func TestOptionalJWTAuth_NoEmail(t *testing.T) {
	token, err := jwt.GenerateToken("user3", "", testJWTSecret, time.Hour)
	require.NoError(t, err)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequestWithContext(context.Background(), "GET", "/", nil)
	c.Request.Header.Set("Authorization", "Bearer "+token)

	OptionalJWTAuth(testJWTSecret)(c)

	assert.False(t, c.IsAborted())
	_, exists := c.Get("user_email")
	assert.False(t, exists, "email should not be set when empty")
}
