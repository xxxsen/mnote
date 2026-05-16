package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestAuthHandlers(t *testing.T) {
	router, cleanup, seed := setupRouter(t)
	defer cleanup()

	code := "123456"
	require.NoError(t, seed("test@example.com", code))
	registerBody := map[string]string{"email": "test@example.com", "password": "secret", "code": code}
	payload, _ := json.Marshal(registerBody)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	require.Equal(t, http.StatusOK, resp.Code)

	loginBody := map[string]string{"email": "test@example.com", "password": "secret"}
	payload, _ = json.Marshal(loginBody)
	req = httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp = httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	require.Equal(t, http.StatusOK, resp.Code)
}
