package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"google.golang.org/genai"
)

type geminiConfig struct {
	APIKey string `json:"api_key"`
}

type geminiProvider struct {
	apiKey string
	mu     sync.Mutex
	client *genai.Client
}

var errProviderResponseTooLarge = errors.New("embedding provider response exceeded size limit")

type boundedResponseBody struct {
	body      io.ReadCloser
	remaining int64
}

func (body *boundedResponseBody) Read(buffer []byte) (int, error) {
	if body.remaining > 0 {
		if int64(len(buffer)) > body.remaining {
			buffer = buffer[:body.remaining]
		}
		read, err := body.body.Read(buffer)
		body.remaining -= int64(read)
		if err == nil {
			return read, nil
		}
		if errors.Is(err, io.EOF) {
			return read, io.EOF
		}
		return read, fmt.Errorf("read bounded provider response: %w", err)
	}
	var extra [1]byte
	read, err := body.body.Read(extra[:])
	if read > 0 {
		return 0, errProviderResponseTooLarge
	}
	if err == nil {
		return 0, nil
	}
	if errors.Is(err, io.EOF) {
		return 0, io.EOF
	}
	return 0, fmt.Errorf("check bounded provider response: %w", err)
}

func (body *boundedResponseBody) Close() error {
	if err := body.body.Close(); err != nil {
		return fmt.Errorf("close bounded provider response: %w", err)
	}
	return nil
}

type boundedResponseTransport struct {
	base     http.RoundTripper
	maxBytes int64
}

func (transport boundedResponseTransport) RoundTrip(
	request *http.Request,
) (*http.Response, error) {
	base := transport.base
	if base == nil {
		base = http.DefaultTransport
	}
	response, err := base.RoundTrip(request)
	if err != nil {
		return nil, fmt.Errorf("execute bounded provider request: %w", err)
	}
	if response.Body != nil {
		response.Body = &boundedResponseBody{
			body:      response.Body,
			remaining: transport.maxBytes,
		}
	}
	return response, nil
}

var defaultGeminiHTTPClient = &http.Client{
	Timeout: 120 * time.Second,
	Transport: boundedResponseTransport{
		base:     http.DefaultTransport,
		maxBytes: maxProviderResponseBytes,
	},
}

func (p *geminiProvider) Name() string {
	return "gemini"
}

func (p *geminiProvider) Embed(
	ctx context.Context, model, text, taskType string,
) ([]float32, error) {
	if p.apiKey == "" {
		return nil, &ProviderError{
			Code:    ErrorInvalidConfig,
			Message: "API key is missing",
			Cause:   ErrUnavailable,
		}
	}
	results, err := p.EmbedBatch(ctx, model, 0, []string{text}, taskType)
	if err != nil {
		return nil, err
	}
	return results[0], nil
}

func (p *geminiProvider) EmbedBatch(
	ctx context.Context,
	model string,
	dimensions int,
	inputs []string,
	taskType string,
) ([][]float32, error) {
	if p.apiKey == "" {
		return nil, &ProviderError{
			Code:    ErrorInvalidConfig,
			Message: "API key is missing",
			Cause:   ErrUnavailable,
		}
	}
	if len(inputs) == 0 {
		return [][]float32{}, nil
	}
	client, err := p.getClient(ctx)
	if err != nil {
		return nil, err
	}
	var cfg *genai.EmbedContentConfig
	if taskType != "" || dimensions > 0 {
		cfg = &genai.EmbedContentConfig{TaskType: taskType}
		if dimensions > 0 {
			if dimensions > 1536 {
				return nil, &ProviderError{
					Code:    ErrorInvalidRequest,
					Message: "embedding dimensions exceed the supported maximum",
				}
			}
			outputDimensions := int32(dimensions)
			cfg.OutputDimensionality = &outputDimensions
		}
	}
	contents := make([]*genai.Content, 0, len(inputs))
	for _, input := range inputs {
		contents = append(contents, &genai.Content{
			Parts: []*genai.Part{{Text: input}},
		})
	}
	resp, err := client.Models.EmbedContent(
		ctx,
		model,
		contents,
		cfg,
	)
	if err != nil {
		return nil, classifyGeminiError(err)
	}
	if len(resp.Embeddings) != len(inputs) {
		return nil, &ProviderError{
			Code: ErrorInvalidResponse,
			Message: fmt.Sprintf(
				"returned %d vectors for %d inputs",
				len(resp.Embeddings),
				len(inputs),
			),
			Cause: ErrNoEmbeddings,
		}
	}
	vectors := make([][]float32, 0, len(resp.Embeddings))
	for _, embedding := range resp.Embeddings {
		vectors = append(vectors, embedding.Values)
	}
	return vectors, nil
}

func (p *geminiProvider) getClient(ctx context.Context) (*genai.Client, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.client != nil {
		return p.client, nil
	}
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:     p.apiKey,
		Backend:    genai.BackendGeminiAPI,
		HTTPClient: defaultGeminiHTTPClient,
	})
	if err != nil {
		return nil, classifyTransportError(err)
	}
	p.client = client
	return client, nil
}

func classifyGeminiError(err error) error {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return classifyTransportError(err)
	}
	if errors.Is(err, errProviderResponseTooLarge) {
		return &ProviderError{
			Code:    ErrorInvalidResponse,
			Message: "response exceeded the configured size limit",
			Cause:   err,
		}
	}
	var apiErr genai.APIError
	if errors.As(err, &apiErr) {
		return providerHTTPError(apiErr.Code, 0, err)
	}
	return classifyTransportError(err)
}

func createGeminiFactory(args any) (IProvider, error) {
	cfg := &geminiConfig{}
	if err := decodeConfig(args, cfg); err != nil {
		return nil, err
	}
	provider := &geminiProvider{apiKey: strings.TrimSpace(cfg.APIKey)}
	if provider.apiKey == "" {
		return provider, nil
	}
	client, err := genai.NewClient(context.Background(), &genai.ClientConfig{
		APIKey:     provider.apiKey,
		Backend:    genai.BackendGeminiAPI,
		HTTPClient: defaultGeminiHTTPClient,
	})
	if err != nil {
		return nil, classifyTransportError(err)
	}
	provider.client = client
	return provider, nil
}

func init() {
	Register("gemini", createGeminiFactory)
}

func decodeConfig(args, dst any) error {
	if args == nil {
		return ErrConfigRequired
	}
	data, err := json.Marshal(args)
	if err != nil {
		return fmt.Errorf("encode ai provider config: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		return fmt.Errorf("decode ai provider config: %w", err)
	}
	return nil
}
