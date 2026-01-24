package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDocumentHandlersAuth(t *testing.T) {
	router, cleanup := setupRouter(t)
	defer cleanup()

	registerBody := map[string]string{"email": "doc@example.com", "password": "secret"}
	payload, _ := json.Marshal(registerBody)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	require.Equal(t, http.StatusOK, resp.Code)

	req = httptest.NewRequest(http.MethodPost, "/api/v1/documents", bytes.NewReader([]byte(`{"title":"t","content":"c"}`)))
	req.Header.Set("Content-Type", "application/json")
	resp = httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	require.Equal(t, http.StatusUnauthorized, resp.Code)

	loginBody := map[string]string{"email": "doc@example.com", "password": "secret"}
	payload, _ = json.Marshal(loginBody)
	req = httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp = httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	require.Equal(t, http.StatusOK, resp.Code)

	var result map[string]map[string]interface{}
	require.NoError(t, json.Unmarshal(resp.Body.Bytes(), &result))
	token, _ := result["data"]["token"].(string)

	req = httptest.NewRequest(http.MethodPost, "/api/v1/documents", bytes.NewReader([]byte(`{"title":"t","content":"c"}`)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	resp = httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	require.Equal(t, http.StatusOK, resp.Code)
}
