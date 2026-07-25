package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type embedRequest struct {
	Model      string   `json:"model"`
	Input      []string `json:"input"`
	Dimensions int      `json:"dimensions,omitempty"`
}

type embedResponse struct {
	Data []struct {
		Embedding []float32 `json:"embedding"`
		Index     *int      `json:"index,omitempty"`
	} `json:"data"`
}

type httpDoer interface {
	doRequest(ctx context.Context, endpoint string, body any) (*http.Response, error)
}

func embedText(ctx context.Context, d httpDoer, baseURL, model, text string) ([]float32, error) {
	results, err := embedTexts(ctx, d, baseURL, model, 0, []string{text})
	if err != nil {
		return nil, err
	}
	return results[0], nil
}

func embedTexts(
	ctx context.Context,
	d httpDoer,
	baseURL, model string,
	dimensions int,
	inputs []string,
) ([][]float32, error) {
	if len(inputs) == 0 {
		return [][]float32{}, nil
	}
	endpoint := strings.TrimRight(baseURL, "/") + "/embeddings"
	reqBody := embedRequest{Model: model, Input: inputs, Dimensions: dimensions}
	resp, err := d.doRequest(ctx, endpoint, reqBody)
	if err != nil {
		return nil, classifyTransportError(err)
	}
	defer func() { _ = resp.Body.Close() }()
	if err := checkHTTPStatus(resp); err != nil {
		return nil, err
	}
	payload, err := io.ReadAll(io.LimitReader(resp.Body, maxProviderResponseBytes+1))
	if err != nil {
		return nil, &ProviderError{
			Code:    ErrorInvalidResponse,
			Message: "could not read response JSON",
			Cause:   err,
		}
	}
	if int64(len(payload)) > maxProviderResponseBytes {
		return nil, &ProviderError{
			Code:    ErrorInvalidResponse,
			Message: "response exceeded the configured size limit",
		}
	}
	var out embedResponse
	if err := json.Unmarshal(payload, &out); err != nil {
		return nil, &ProviderError{
			Code:    ErrorInvalidResponse,
			Message: "could not decode response JSON",
			Cause:   err,
		}
	}
	if len(out.Data) != len(inputs) {
		return nil, &ProviderError{
			Code: ErrorInvalidResponse,
			Message: fmt.Sprintf(
				"returned %d vectors for %d inputs",
				len(out.Data),
				len(inputs),
			),
			Cause: ErrNoEmbeddings,
		}
	}
	vectors, err := orderedOpenAIEmbeddings(out, len(inputs))
	if err != nil {
		return nil, err
	}
	return vectors, nil
}

func orderedOpenAIEmbeddings(
	response embedResponse,
	expected int,
) ([][]float32, error) {
	hasIndexes := false
	hasMissingIndexes := false
	for _, item := range response.Data {
		if item.Index == nil {
			hasMissingIndexes = true
		} else {
			hasIndexes = true
		}
	}
	if !hasIndexes {
		vectors := make([][]float32, expected)
		for index, item := range response.Data {
			vectors[index] = item.Embedding
		}
		return vectors, nil
	}
	if hasMissingIndexes {
		return nil, invalidOpenAIEmbeddingOrder(
			"response mixed indexed and unindexed embeddings",
		)
	}
	vectors := make([][]float32, expected)
	seen := make([]bool, expected)
	for _, item := range response.Data {
		index := *item.Index
		if index < 0 || index >= expected || seen[index] {
			return nil, invalidOpenAIEmbeddingOrder(
				"response contained a duplicate or out-of-range embedding index",
			)
		}
		vectors[index] = item.Embedding
		seen[index] = true
	}
	return vectors, nil
}

func invalidOpenAIEmbeddingOrder(message string) error {
	return &ProviderError{
		Code:    ErrorInvalidResponse,
		Message: message,
	}
}
