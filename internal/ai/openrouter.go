package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

const defaultOpenRouterBaseURL = "https://openrouter.ai/api/v1"

type openrouterConfig struct {
	APIKey      string `json:"api_key"`
	BaseURL     string `json:"base_url"`
	HTTPReferer string `json:"http_referer"`
	XTitle      string `json:"x_title"`
}

type openrouterProvider struct {
	apiKey      string
	baseURL     string
	httpReferer string
	xTitle      string
}

func (p *openrouterProvider) Name() string {
	return "openrouter"
}

func (p *openrouterProvider) Generate(ctx context.Context, model, prompt string) (string, error) {
	if p.apiKey == "" {
		return "", ErrUnavailable
	}
	return chatGenerate(ctx, p, p.baseURL, model, prompt)
}

func (p *openrouterProvider) Embed(ctx context.Context, model, text, _ string) ([]float32, error) {
	if p.apiKey == "" {
		return nil, ErrUnavailable
	}
	return embedText(ctx, p, p.baseURL, model, text)
}

func (p *openrouterProvider) doRequest(
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
	if p.httpReferer != "" {
		req.Header.Set("Http-Referer", p.httpReferer)
	}
	if p.xTitle != "" {
		req.Header.Set("X-Title", p.xTitle)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("execute request: %w", err)
	}
	return resp, nil
}

func createOpenRouterFactory(args any) (IProvider, error) {
	cfg := &openrouterConfig{}
	if err := decodeConfig(args, cfg); err != nil {
		return nil, err
	}
	baseURL := strings.TrimSpace(cfg.BaseURL)
	if baseURL == "" {
		baseURL = defaultOpenRouterBaseURL
	}
	return &openrouterProvider{
		apiKey:      strings.TrimSpace(cfg.APIKey),
		baseURL:     baseURL,
		httpReferer: strings.TrimSpace(cfg.HTTPReferer),
		xTitle:      strings.TrimSpace(cfg.XTitle),
	}, nil
}

func init() {
	Register("openrouter", createOpenRouterFactory)
}
