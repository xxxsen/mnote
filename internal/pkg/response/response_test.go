package response

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func init() {
	gin.SetMode(gin.TestMode)
}

func TestAsCodeErr(t *testing.T) {
	err := AsCodeErr(404, "not found")
	assert.Equal(t, "not found", err.Error())

	var ce codeErr
	require.True(t, errors.As(err, &ce))
	assert.Equal(t, uint32(404), ce.Code())
}

func TestAsCodeErr_ZeroCode(t *testing.T) {
	err := AsCodeErr(0, "ok")
	var ce codeErr
	require.True(t, errors.As(err, &ce))
	assert.Equal(t, uint32(0), ce.Code())
}

func TestSuccess(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequestWithContext(context.Background(), "GET", "/", nil)

	Success(c, map[string]string{"key": "value"})
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestError(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequestWithContext(context.Background(), "GET", "/", nil)

	Error(c, 10001, "something wrong")
	assert.Equal(t, http.StatusOK, w.Code)
}
