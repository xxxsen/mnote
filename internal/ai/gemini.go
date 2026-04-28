package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"google.golang.org/genai"
)

type geminiConfig struct {
	APIKey string `json:"api_key"`
}

type geminiProvider struct {
	apiKey string
}

func (p *geminiProvider) Name() string {
	return "gemini"
}

func (p *geminiProvider) Generate(
	ctx context.Context, model, prompt string,
) (string, error) {
	if p.apiKey == "" {
		return "", ErrUnavailable
	}
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:  p.apiKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		return "", fmt.Errorf("create gemini client: %w", err)
	}
	resp, err := client.Models.GenerateContent(
		ctx, model,
		[]*genai.Content{{Parts: []*genai.Part{{Text: prompt}}}},
		nil,
	)
	if err != nil {
		return "", fmt.Errorf("gemini generate: %w", err)
	}
	return strings.TrimSpace(resp.Text()), nil
}

func (p *geminiProvider) Embed(
	ctx context.Context, model, text, taskType string,
) ([]float32, error) {
	if p.apiKey == "" {
		return nil, ErrUnavailable
	}
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:  p.apiKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		return nil, fmt.Errorf("create gemini client: %w", err)
	}
	var cfg *genai.EmbedContentConfig
	if taskType != "" {
		cfg = &genai.EmbedContentConfig{TaskType: taskType}
	}
	resp, err := client.Models.EmbedContent(
		ctx, model,
		[]*genai.Content{{Parts: []*genai.Part{{Text: text}}}},
		cfg,
	)
	if err != nil {
		return nil, fmt.Errorf("gemini embed: %w", err)
	}
	if len(resp.Embeddings) == 0 {
		return nil, ErrNoEmbeddings
	}
	return resp.Embeddings[0].Values, nil
}

func createGeminiFactory(args any) (IProvider, error) {
	cfg := &geminiConfig{}
	if err := decodeConfig(args, cfg); err != nil {
		return nil, err
	}
	return &geminiProvider{apiKey: strings.TrimSpace(cfg.APIKey)}, nil
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
	if err := json.Unmarshal(data, dst); err != nil {
		return fmt.Errorf("decode ai provider config: %w", err)
	}
	return nil
}
