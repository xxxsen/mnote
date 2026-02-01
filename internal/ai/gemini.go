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

func (p *geminiProvider) Generate(ctx context.Context, model string, prompt string) (string, error) {
	if p.apiKey == "" {
		return "", ErrUnavailable
	}
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:  p.apiKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		return "", err
	}
	resp, err := client.Models.GenerateContent(
		ctx,
		model,
		[]*genai.Content{{Parts: []*genai.Part{{Text: prompt}}}},
		nil,
	)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(resp.Text()), nil
}

type geminiEmbedProvider struct {
	apiKey string
}

func (p *geminiEmbedProvider) Name() string {
	return "gemini"
}

func (p *geminiEmbedProvider) Embed(ctx context.Context, model string, text string, taskType string) ([]float32, error) {
	if p.apiKey == "" {
		return nil, ErrUnavailable
	}
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:  p.apiKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		return nil, err
	}
	var config *genai.EmbedContentConfig
	if taskType != "" {
		config = &genai.EmbedContentConfig{
			TaskType: taskType,
		}
	}
	resp, err := client.Models.EmbedContent(
		ctx,
		model,
		[]*genai.Content{{Parts: []*genai.Part{{Text: text}}}},
		config,
	)
	if err != nil {
		return nil, err
	}
	if resp.Embeddings == nil || len(resp.Embeddings) == 0 {
		return nil, fmt.Errorf("no embedding values returned")
	}
	return resp.Embeddings[0].Values, nil
}

func createGeminiFactory(args interface{}) (IAIProvider, error) {
	cfg := &geminiConfig{}
	if err := decodeConfig(args, cfg); err != nil {
		return nil, err
	}
	provider := &geminiProvider{
		apiKey: strings.TrimSpace(cfg.APIKey),
	}
	return provider, nil
}

func createGeminiEmbedFactory(args interface{}) (IEmbedProvider, error) {
	cfg := &geminiConfig{}
	if err := decodeConfig(args, cfg); err != nil {
		return nil, err
	}
	provider := &geminiEmbedProvider{
		apiKey: strings.TrimSpace(cfg.APIKey),
	}
	return provider, nil
}

func init() {
	Register("gemini", createGeminiFactory)
	RegisterEmbed("gemini", createGeminiEmbedFactory)
}

func decodeConfig(args interface{}, dst interface{}) error {
	if args == nil {
		return fmt.Errorf("ai provider config is required")
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
