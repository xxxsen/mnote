package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

type chatRequest struct {
	Model    string    `json:"model"`
	Messages []chatMsg `json:"messages"`
	Stream   bool      `json:"stream"`
}

type chatMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

type embedRequest struct {
	Model string `json:"model"`
	Input string `json:"input"`
}

type embedResponse struct {
	Data []struct {
		Embedding []float32 `json:"embedding"`
	} `json:"data"`
}

type httpDoer interface {
	doRequest(ctx context.Context, endpoint string, body any) (*http.Response, error)
}

func chatGenerate(ctx context.Context, d httpDoer, baseURL, model, prompt string) (string, error) {
	endpoint := strings.TrimRight(baseURL, "/") + "/chat/completions"
	reqBody := chatRequest{
		Model:    model,
		Messages: []chatMsg{{Role: "user", Content: prompt}},
		Stream:   false,
	}
	resp, err := d.doRequest(ctx, endpoint, reqBody)
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()
	if err := checkHTTPStatus(resp); err != nil {
		return "", err
	}
	var out chatResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}
	if len(out.Choices) == 0 {
		return "", ErrNoChoices
	}
	return strings.TrimSpace(out.Choices[0].Message.Content), nil
}

func embedText(ctx context.Context, d httpDoer, baseURL, model, text string) ([]float32, error) {
	endpoint := strings.TrimRight(baseURL, "/") + "/embeddings"
	reqBody := embedRequest{Model: model, Input: text}
	resp, err := d.doRequest(ctx, endpoint, reqBody)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	if err := checkHTTPStatus(resp); err != nil {
		return nil, err
	}
	var out embedResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	if len(out.Data) == 0 {
		return nil, ErrNoEmbeddings
	}
	return out.Data[0].Embedding, nil
}
