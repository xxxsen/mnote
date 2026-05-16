package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/pkg/errcode"
)

func TestDocumentHandlersAuth(t *testing.T) {
	router, cleanup, seed := setupRouter(t)
	defer cleanup()

	code := "123456"
	require.NoError(t, seed("doc@example.com", code))
	registerBody := map[string]string{"email": "doc@example.com", "password": "secret", "code": code}
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
	require.Equal(t, http.StatusOK, resp.Code)
	var unauthorized map[string]interface{}
	require.NoError(t, json.Unmarshal(resp.Body.Bytes(), &unauthorized))
	codeValue, _ := unauthorized["code"].(float64)
	require.Equal(t, float64(errcode.ErrUnauthorized), codeValue)

	loginBody := map[string]string{"email": "doc@example.com", "password": "secret"}
	payload, _ = json.Marshal(loginBody)
	req = httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp = httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	require.Equal(t, http.StatusOK, resp.Code)

	var result struct {
		Code int                    `json:"code"`
		Msg  string                 `json:"msg"`
		Data map[string]interface{} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(resp.Body.Bytes(), &result))
	token, _ := result.Data["token"].(string)

	req = httptest.NewRequest(http.MethodPost, "/api/v1/documents", bytes.NewReader([]byte(`{"title":"t","content":"c"}`)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	resp = httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	require.Equal(t, http.StatusOK, resp.Code)
}
