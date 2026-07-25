package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	defaultOpenAIBaseURL           = "https://api.openai.com/v1"
	maxProviderResponseBytes int64 = 4 << 20
)

// The Profile layer owns the per-request timeout (5-120 seconds). Keep a
// transport-level ceiling at the maximum accepted value so a shorter profile
// deadline remains effective while configurations above 30 seconds are not
// silently truncated by a shared client.
var defaultEmbeddingHTTPClient = &http.Client{Timeout: 120 * time.Second}

type openAIConfig struct {
	APIKey  string `json:"api_key"`
	BaseURL string `json:"base_url"`
}

type openAIProvider struct {
	apiKey  string
	baseURL string
	client  *http.Client
}

func (p *openAIProvider) Name() string {
	return "openai"
}

func (p *openAIProvider) Embed(ctx context.Context, model, text, _ string) ([]float32, error) {
	if p.apiKey == "" {
		return nil, &ProviderError{
			Code:    ErrorInvalidConfig,
			Message: "API key is missing",
			Cause:   ErrUnavailable,
		}
	}
	return embedText(ctx, p, p.baseURL, model, text)
}

func (p *openAIProvider) EmbedBatch(
	ctx context.Context,
	model string,
	dimensions int,
	inputs []string,
	_ string,
) ([][]float32, error) {
	if p.apiKey == "" {
		return nil, &ProviderError{
			Code:    ErrorInvalidConfig,
			Message: "API key is missing",
			Cause:   ErrUnavailable,
		}
	}
	return embedTexts(ctx, p, p.baseURL, model, dimensions, inputs)
}

func (p *openAIProvider) doRequest(
	ctx context.Context, endpoint string, body any,
) (*http.Response, error) {
	data, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}
	req, err := http.NewRequestWithContext(
		ctx, http.MethodPost, endpoint, bytes.NewReader(data),
	)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Content-Type", "application/json")
	client := p.client
	if client == nil {
		client = defaultEmbeddingHTTPClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("execute request: %w", err)
	}
	return resp, nil
}

func createOpenAIFactory(args any) (IProvider, error) {
	cfg := &openAIConfig{}
	if err := decodeConfig(args, cfg); err != nil {
		return nil, err
	}
	baseURL := strings.TrimSpace(cfg.BaseURL)
	if baseURL == "" {
		baseURL = defaultOpenAIBaseURL
	}
	return &openAIProvider{
		apiKey:  strings.TrimSpace(cfg.APIKey),
		baseURL: baseURL,
	}, nil
}

func init() {
	Register("openai", createOpenAIFactory)
}

func checkHTTPStatus(resp *http.Response) error {
	if resp.StatusCode >= http.StatusOK &&
		resp.StatusCode < http.StatusMultipleChoices {
		return nil
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))
	retryAfter := parseRetryAfter(resp.Header.Get("Retry-After"), time.Now())
	return providerHTTPError(resp.StatusCode, retryAfter, ErrRequestFailed)
}

func parseRetryAfter(value string, now time.Time) time.Duration {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}
	if seconds, err := strconv.ParseInt(value, 10, 64); err == nil {
		if seconds <= 0 {
			return 0
		}
		return time.Duration(seconds) * time.Second
	}
	when, err := http.ParseTime(value)
	if err != nil || !when.After(now) {
		return 0
	}
	return when.Sub(now)
}
