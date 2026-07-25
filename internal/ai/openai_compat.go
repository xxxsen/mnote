package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

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
