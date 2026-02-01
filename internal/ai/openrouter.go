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

type openrouterRequest struct {
	Model    string          `json:"model"`
	Messages []openrouterMsg `json:"messages"`
	Stream   bool            `json:"stream"`
}

type openrouterMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openrouterResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

func (p *openrouterProvider) Name() string {
	return "openrouter"
}

func (p *openrouterProvider) Generate(ctx context.Context, model string, prompt string) (string, error) {
	if p.apiKey == "" {
		return "", ErrUnavailable
	}
	endpoint := strings.TrimRight(p.baseURL, "/") + "/chat/completions"
	reqBody := openrouterRequest{
		Model:    model,
		Messages: []openrouterMsg{{Role: "user", Content: prompt}},
		Stream:   false,
	}
	data, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Content-Type", "application/json")
	if p.httpReferer != "" {
		req.Header.Set("HTTP-Referer", p.httpReferer)
	}
	if p.xTitle != "" {
		req.Header.Set("X-Title", p.xTitle)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("openrouter request failed: %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}
	var out openrouterResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	if len(out.Choices) == 0 {
		return "", fmt.Errorf("openrouter response has no choices")
	}
	return strings.TrimSpace(out.Choices[0].Message.Content), nil
}

func createOpenRouterFactory(args interface{}) (IAIProvider, error) {
	cfg := &openrouterConfig{}
	if err := decodeConfig(args, cfg); err != nil {
		return nil, err
	}
	baseURL := strings.TrimSpace(cfg.BaseURL)
	if baseURL == "" {
		baseURL = defaultOpenRouterBaseURL
	}
	provider := &openrouterProvider{
		apiKey:      strings.TrimSpace(cfg.APIKey),
		baseURL:     baseURL,
		httpReferer: strings.TrimSpace(cfg.HTTPReferer),
		xTitle:      strings.TrimSpace(cfg.XTitle),
	}
	return provider, nil
}

func init() {
	Register("openrouter", createOpenRouterFactory)
}
