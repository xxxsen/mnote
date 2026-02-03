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

type openAIChatRequest struct {
	Model    string          `json:"model"`
	Messages []openAIChatMsg `json:"messages"`
	Stream   bool            `json:"stream"`
}

type openAIChatMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAIChatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

type openAIEmbedRequest struct {
	Model string `json:"model"`
	Input string `json:"input"`
}

type openAIEmbedResponse struct {
	Data []struct {
		Embedding []float32 `json:"embedding"`
	} `json:"data"`
}

func (p *openAIProvider) Name() string {
	return "openai"
}

func (p *openAIProvider) Generate(ctx context.Context, model string, prompt string) (string, error) {
	if p.apiKey == "" {
		return "", ErrUnavailable
	}
	endpoint := strings.TrimRight(p.baseURL, "/") + "/chat/completions"
	reqBody := openAIChatRequest{
		Model:    model,
		Messages: []openAIChatMsg{{Role: "user", Content: prompt}},
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
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("openai request failed: %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}
	var out openAIChatResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	if len(out.Choices) == 0 {
		return "", fmt.Errorf("openai response has no choices")
	}
	return strings.TrimSpace(out.Choices[0].Message.Content), nil
}

type openAIEmbedProvider struct {
	apiKey  string
	baseURL string
}

func (p *openAIEmbedProvider) Name() string {
	return "openai"
}

func (p *openAIEmbedProvider) Embed(ctx context.Context, model string, text string, taskType string) ([]float32, error) {
	if p.apiKey == "" {
		return nil, ErrUnavailable
	}
	endpoint := strings.TrimRight(p.baseURL, "/") + "/embeddings"
	reqBody := openAIEmbedRequest{
		Model: model,
		Input: text,
	}
	data, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+p.apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("openai request failed: %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}
	var out openAIEmbedResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	if len(out.Data) == 0 {
		return nil, fmt.Errorf("openai response has no embeddings")
	}
	return out.Data[0].Embedding, nil
}

func createOpenAIFactory(args interface{}) (IAIProvider, error) {
	cfg := &openAIConfig{}
	if err := decodeConfig(args, cfg); err != nil {
		return nil, err
	}
	baseURL := strings.TrimSpace(cfg.BaseURL)
	if baseURL == "" {
		baseURL = defaultOpenAIBaseURL
	}
	provider := &openAIProvider{
		apiKey:  strings.TrimSpace(cfg.APIKey),
		baseURL: baseURL,
	}
	return provider, nil
}

func createOpenAIEmbedFactory(args interface{}) (IEmbedProvider, error) {
	cfg := &openAIConfig{}
	if err := decodeConfig(args, cfg); err != nil {
		return nil, err
	}
	baseURL := strings.TrimSpace(cfg.BaseURL)
	if baseURL == "" {
		baseURL = defaultOpenAIBaseURL
	}
	provider := &openAIEmbedProvider{
		apiKey:  strings.TrimSpace(cfg.APIKey),
		baseURL: baseURL,
	}
	return provider, nil
}

func init() {
	Register("openai", createOpenAIFactory)
	RegisterEmbed("openai", createOpenAIEmbedFactory)
}
