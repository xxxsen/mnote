package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const defaultOpenAIBaseURL = "https://api.openai.com/v1"

type openAIConfig struct {
	APIKey  string `json:"api_key"`
	BaseURL string `json:"base_url"`
}

type openAIProvider struct {
	apiKey  string
	baseURL string
}

func (p *openAIProvider) Name() string {
	return "openai"
}

func (p *openAIProvider) Generate(ctx context.Context, model, prompt string) (string, error) {
	if p.apiKey == "" {
		return "", ErrUnavailable
	}
	return chatGenerate(ctx, p, p.baseURL, model, prompt)
}

func (p *openAIProvider) Embed(ctx context.Context, model, text, _ string) ([]float32, error) {
	if p.apiKey == "" {
		return nil, ErrUnavailable
	}
	return embedText(ctx, p, p.baseURL, model, text)
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
	resp, err := http.DefaultClient.Do(req)
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
	body, _ := io.ReadAll(resp.Body)
	return fmt.Errorf(
		"%w: %s: %s",
		ErrRequestFailed, resp.Status, strings.TrimSpace(string(body)),
	)
}
