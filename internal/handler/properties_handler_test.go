package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPropertiesHandler_Get(t *testing.T) {
	h := NewPropertiesHandler(
		Properties{EnableUserRegister: true},
		BannerConfig{Enable: true, Title: "Notice", Wording: "Hello"},
	)
	r := newTestRouter()
	r.GET("/properties", h.Get)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/properties", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	resp := parseResponseT(t, w)
	assert.Equal(t, float64(0), resp["code"])
	data, ok := resp["data"].(map[string]any)
	require.True(t, ok)
	_, ok = data["properties"].(map[string]any)
	require.True(t, ok)
	banner, ok := data["banner"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, true, banner["enable"])
}
