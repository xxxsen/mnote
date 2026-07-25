package ai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type fakeHTTPDoer struct {
	server *httptest.Server
}

func newFakeDoer() *fakeHTTPDoer {
	srv := httptest.NewServer(http.NotFoundHandler())
	return &fakeHTTPDoer{server: srv}
}

func (f *fakeHTTPDoer) doRequest(ctx context.Context, endpoint string, body any) (*http.Response, error) {
	data, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(string(data)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	return http.DefaultClient.Do(req)
}

func (f *fakeHTTPDoer) close() { f.server.Close() }

func TestEmbedText_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		resp := embedResponse{
			Data: []struct {
				Embedding []float32 `json:"embedding"`
				Index     *int      `json:"index,omitempty"`
			}{{Embedding: []float32{0.1, 0.2, 0.3}}},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	doer := newFakeDoer()
	defer doer.close()

	result, err := embedText(context.Background(), doer, srv.URL, "model", "text")
	require.NoError(t, err)
	assert.Equal(t, []float32{0.1, 0.2, 0.3}, result)
}

func TestEmbedText_NoEmbeddings(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	defer srv.Close()

	doer := newFakeDoer()
	defer doer.close()

	_, err := embedText(context.Background(), doer, srv.URL, "model", "text")
	assert.ErrorIs(t, err, ErrNoEmbeddings)
}

func TestEmbedTexts_RejectsOversizedSuccessResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(
			w,
			`{"data":[{"embedding":[1]}]}`+
				strings.Repeat(" ", int(maxProviderResponseBytes)),
		)
	}))
	defer srv.Close()

	doer := newFakeDoer()
	defer doer.close()

	_, err := embedTexts(
		context.Background(),
		doer,
		srv.URL,
		"model",
		1,
		[]string{"text"},
	)
	require.Error(t, err)
	code, _, ok := ErrorDetails(err)
	assert.True(t, ok)
	assert.Equal(t, ErrorInvalidResponse, code)
	assert.Contains(t, err.Error(), "size limit")
}

func TestEmbedTexts_ReordersIndexedBatchResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(
			w,
			`{"data":[{"index":1,"embedding":[2]},{"index":0,"embedding":[1]}]}`,
		)
	}))
	defer srv.Close()

	doer := newFakeDoer()
	defer doer.close()

	vectors, err := embedTexts(
		context.Background(),
		doer,
		srv.URL,
		"model",
		1,
		[]string{"first", "second"},
	)
	require.NoError(t, err)
	assert.Equal(t, [][]float32{{1}, {2}}, vectors)
}

func TestEmbedTexts_RejectsInvalidBatchIndexes(t *testing.T) {
	for _, response := range []string{
		`{"data":[{"index":0,"embedding":[1]},{"index":0,"embedding":[2]}]}`,
		`{"data":[{"index":0,"embedding":[1]},{"embedding":[2]}]}`,
	} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_, _ = io.WriteString(w, response)
		}))

		doer := newFakeDoer()
		_, err := embedTexts(
			context.Background(),
			doer,
			srv.URL,
			"model",
			1,
			[]string{"first", "second"},
		)
		doer.close()
		srv.Close()

		require.Error(t, err)
		code, _, ok := ErrorDetails(err)
		assert.True(t, ok)
		assert.Equal(t, ErrorInvalidResponse, code)
	}
}

func TestCheckHTTPStatus_OK(t *testing.T) {
	resp := &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(""))}
	assert.NoError(t, checkHTTPStatus(resp))
}

func TestCheckHTTPStatus_Error(t *testing.T) {
	resp := &http.Response{
		StatusCode: 429,
		Status:     "429 Too Many Requests",
		Body:       io.NopCloser(strings.NewReader("rate limited")),
		Header:     http.Header{"Retry-After": []string{"60"}},
	}
	err := checkHTTPStatus(resp)
	assert.ErrorIs(t, err, ErrRequestFailed)
	code, retryAfter, ok := ErrorDetails(err)
	assert.True(t, ok)
	assert.Equal(t, ErrorRateLimited, code)
	assert.Equal(t, time.Minute, retryAfter)
	assert.NotContains(t, err.Error(), "rate limited")
}

func TestProviderHTTPErrorClassification(t *testing.T) {
	for _, testCase := range []struct {
		status int
		code   ErrorCode
	}{
		{status: http.StatusBadRequest, code: ErrorInvalidRequest},
		{status: http.StatusUnauthorized, code: ErrorUnauthorized},
		{status: http.StatusForbidden, code: ErrorUnauthorized},
		{status: http.StatusRequestTimeout, code: ErrorTimeout},
		{status: http.StatusTooManyRequests, code: ErrorRateLimited},
		{status: http.StatusInternalServerError, code: ErrorUpstream5xx},
	} {
		err := providerHTTPError(testCase.status, 0, ErrRequestFailed)
		code, _, ok := ErrorDetails(err)
		assert.True(t, ok)
		assert.Equal(t, testCase.code, code)
	}
}

func TestOpenAIProvider_Factory(t *testing.T) {
	p, err := createOpenAIFactory(map[string]any{"api_key": "sk-test", "base_url": "https://custom.api"})
	require.NoError(t, err)
	assert.Equal(t, "openai", p.Name())
}

func TestOpenAIProvider_Factory_DefaultBaseURL(t *testing.T) {
	p, err := createOpenAIFactory(map[string]any{"api_key": "sk-test"})
	require.NoError(t, err)
	oai := p.(*openAIProvider)
	assert.Equal(t, defaultOpenAIBaseURL, oai.baseURL)
}

func TestOpenAIProvider_Factory_NilConfig(t *testing.T) {
	_, err := createOpenAIFactory(nil)
	assert.ErrorIs(t, err, ErrConfigRequired)
}

func TestOpenAIProvider_Embed_NoKey(t *testing.T) {
	p := &openAIProvider{apiKey: "", baseURL: "http://localhost"}
	_, err := p.Embed(context.Background(), "model", "text", "search")
	assert.ErrorIs(t, err, ErrUnavailable)
}

func TestOpenRouterProvider_Factory(t *testing.T) {
	p, err := createOpenRouterFactory(map[string]any{
		"api_key":      "sk-test",
		"http_referer": "http://example.com",
		"x_title":      "MyApp",
	})
	require.NoError(t, err)
	assert.Equal(t, "openrouter", p.Name())
	or := p.(*openrouterProvider)
	assert.Equal(t, "http://example.com", or.httpReferer)
	assert.Equal(t, "MyApp", or.xTitle)
}

func TestOpenRouterProvider_Factory_DefaultBaseURL(t *testing.T) {
	p, err := createOpenRouterFactory(map[string]any{"api_key": "sk-test"})
	require.NoError(t, err)
	or := p.(*openrouterProvider)
	assert.Equal(t, defaultOpenRouterBaseURL, or.baseURL)
}

func TestOpenRouterProvider_Factory_NilConfig(t *testing.T) {
	_, err := createOpenRouterFactory(nil)
	assert.ErrorIs(t, err, ErrConfigRequired)
}

func TestOpenRouterProvider_Factory_CustomBaseURL(t *testing.T) {
	p, err := createOpenRouterFactory(map[string]any{"api_key": "sk-test", "base_url": "https://custom.endpoint"})
	require.NoError(t, err)
	or := p.(*openrouterProvider)
	assert.Equal(t, "https://custom.endpoint", or.baseURL)
}

func TestOpenRouterProvider_Embed_NoKey(t *testing.T) {
	p := &openrouterProvider{apiKey: ""}
	_, err := p.Embed(context.Background(), "model", "text", "search")
	assert.ErrorIs(t, err, ErrUnavailable)
}

func TestGeminiProvider_Factory(t *testing.T) {
	p, err := createGeminiFactory(map[string]any{"api_key": "test-key"})
	require.NoError(t, err)
	assert.Equal(t, "gemini", p.Name())
}

func TestGeminiProvider_Factory_NilConfig(t *testing.T) {
	_, err := createGeminiFactory(nil)
	assert.ErrorIs(t, err, ErrConfigRequired)
}

func TestGeminiProvider_Embed_NoKey(t *testing.T) {
	p := &geminiProvider{apiKey: ""}
	_, err := p.Embed(context.Background(), "model", "text", "search")
	assert.ErrorIs(t, err, ErrUnavailable)
}

func TestDecodeConfig_Nil(t *testing.T) {
	assert.ErrorIs(t, decodeConfig(nil, &struct{}{}), ErrConfigRequired)
}

func TestDecodeConfig_Valid(t *testing.T) {
	cfg := &openAIConfig{}
	err := decodeConfig(map[string]any{"api_key": "k", "base_url": "u"}, cfg)
	require.NoError(t, err)
	assert.Equal(t, "k", cfg.APIKey)
	assert.Equal(t, "u", cfg.BaseURL)
}

func TestDecodeConfig_InvalidTarget(t *testing.T) {
	err := decodeConfig(map[string]any{"key": "val"}, make(chan int))
	assert.Error(t, err)
}

func TestNewProvider_Registered(t *testing.T) {
	p, err := NewProvider("openai", map[string]any{"api_key": "test"})
	require.NoError(t, err)
	assert.Equal(t, "openai", p.Name())
}

func TestOpenAIProvider_Embed_WithServer(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		resp := embedResponse{
			Data: []struct {
				Embedding []float32 `json:"embedding"`
				Index     *int      `json:"index,omitempty"`
			}{{Embedding: []float32{0.5}}},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	p := &openAIProvider{apiKey: "test-key", baseURL: srv.URL}
	result, err := p.Embed(context.Background(), "model", "text", "search")
	require.NoError(t, err)
	assert.Equal(t, []float32{0.5}, result)
}

func TestEmbedText_DecodeError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`not json`))
	}))
	defer srv.Close()

	doer := newFakeDoer()
	defer doer.close()

	_, err := embedText(context.Background(), doer, srv.URL, "model", "text")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "decode")
}

func TestEmbedText_HTTPError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("error"))
	}))
	defer srv.Close()

	doer := newFakeDoer()
	defer doer.close()

	_, err := embedText(context.Background(), doer, srv.URL, "model", "text")
	assert.ErrorIs(t, err, ErrRequestFailed)
}

func TestOpenRouterProvider_Embed_WithServer(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		resp := embedResponse{
			Data: []struct {
				Embedding []float32 `json:"embedding"`
				Index     *int      `json:"index,omitempty"`
			}{{Embedding: []float32{0.5}}},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	p := &openrouterProvider{
		apiKey: "test-key", baseURL: srv.URL,
		httpReferer: "http://ref.com", xTitle: "Test",
	}
	result, err := p.Embed(context.Background(), "model", "text", "search")
	require.NoError(t, err)
	assert.Equal(t, []float32{0.5}, result)
}

func TestOpenAIProvider_DoRequest_CanceledCtx(t *testing.T) {
	p := &openAIProvider{apiKey: "key", baseURL: "http://localhost:1"}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	resp, err := p.doRequest(ctx, "http://localhost:1/v1/chat", map[string]string{"a": "b"})
	assert.Error(t, err)
	if resp != nil {
		_ = resp.Body.Close()
	}
}

func TestOpenAIProvider_DoRequest_BadURL(t *testing.T) {
	p := &openAIProvider{apiKey: "key", baseURL: "http://localhost"}
	resp, err := p.doRequest(context.Background(), "://invalid", map[string]string{})
	assert.Error(t, err)
	if resp != nil {
		_ = resp.Body.Close()
	}
}

func TestOpenRouterProvider_DoRequest_CanceledCtx(t *testing.T) {
	p := &openrouterProvider{apiKey: "key", baseURL: "http://localhost:1"}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	resp, err := p.doRequest(ctx, "http://localhost:1/v1/chat", map[string]string{"a": "b"})
	assert.Error(t, err)
	if resp != nil {
		_ = resp.Body.Close()
	}
}

func TestOpenRouterProvider_DoRequest_BadURL(t *testing.T) {
	p := &openrouterProvider{apiKey: "key", baseURL: "http://localhost"}
	resp, err := p.doRequest(context.Background(), "://invalid", map[string]string{})
	assert.Error(t, err)
	if resp != nil {
		_ = resp.Body.Close()
	}
}

func TestOpenRouterProvider_DoRequest_NoReferer(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Empty(t, r.Header.Get("Http-Referer"))
		assert.Empty(t, r.Header.Get("X-Title"))
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()
	p := &openrouterProvider{apiKey: "key", baseURL: srv.URL}
	resp, err := p.doRequest(context.Background(), srv.URL+"/test", map[string]string{})
	require.NoError(t, err)
	_ = resp.Body.Close()
}
