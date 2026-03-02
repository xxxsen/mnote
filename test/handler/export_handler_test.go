package handler_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestExportDocument(t *testing.T) {
	router, cleanup, seed := setupRouter(t)
	defer cleanup()

	code := "123456"
	require.NoError(t, seed("export@example.com", code))

	registerBody := map[string]string{"email": "export@example.com", "password": "secret", "code": code}
	payload, _ := json.Marshal(registerBody)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	resp := httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	require.Equal(t, http.StatusOK, resp.Code)

	var registerResult struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(resp.Body.Bytes(), &registerResult))
	token := registerResult.Data.Token

	create := "{\"title\":\"Demo\",\"content\":\"# Demo\\n\\n[toc]\\n\\n```mermaid\\ngraph TD\\nA-->B\\n```\\n\\n```go\\nfmt.Println(1)\\n```\"}"
	req = httptest.NewRequest(http.MethodPost, "/api/v1/documents", bytes.NewReader([]byte(create)))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	resp = httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	require.Equal(t, http.StatusOK, resp.Code)

	var createResult struct {
		Data struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	require.NoError(t, json.Unmarshal(resp.Body.Bytes(), &createResult))

	req = httptest.NewRequest(http.MethodGet, "/api/v1/export/documents/"+createResult.Data.ID+"?format=markdown", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp = httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	require.Equal(t, http.StatusOK, resp.Code)
	require.Contains(t, resp.Body.String(), "# Demo")

	req = httptest.NewRequest(http.MethodGet, "/api/v1/export/documents/"+createResult.Data.ID+"?format=confluence_html", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp = httptest.NewRecorder()
	router.ServeHTTP(resp, req)
	require.Equal(t, http.StatusOK, resp.Code)
	require.Contains(t, resp.Body.String(), `<ac:structured-macro ac:name="toc" />`)
	require.Contains(t, resp.Body.String(), `<ac:structured-macro ac:name="mermaid">`)
	require.Contains(t, resp.Body.String(), `<ac:structured-macro ac:name="code">`)
}
