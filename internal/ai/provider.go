package ai

import (
	"context"
	"fmt"
	"strings"
)

type IAIProvider interface {
	Name() string
	Generate(ctx context.Context, model string, prompt string) (string, error)
}

type IEmbedProvider interface {
	Name() string
	Embed(ctx context.Context, model string, text string, taskType string) ([]float32, error)
}

type IGenerator interface {
	Generate(ctx context.Context, prompt string) (string, error)
}

type IEmbedder interface {
	Embed(ctx context.Context, text string, taskType string) ([]float32, error)
}

type generator struct {
	provider IAIProvider
	model    string
}

func NewGenerator(p IAIProvider, model string) IGenerator {
	return &generator{provider: p, model: model}
}

func (g *generator) Generate(ctx context.Context, prompt string) (string, error) {
	return g.provider.Generate(ctx, g.model, prompt)
}

type embedder struct {
	provider IEmbedProvider
	model    string
}

func NewEmbedder(p IEmbedProvider, model string) IEmbedder {
	return &embedder{provider: p, model: model}
}

func (e *embedder) Embed(ctx context.Context, text string, taskType string) ([]float32, error) {
	return e.provider.Embed(ctx, e.model, text, taskType)
}

type ProviderFactory func(args interface{}) (IAIProvider, error)
type EmbedProviderFactory func(args interface{}) (IEmbedProvider, error)

var registry = map[string]ProviderFactory{}
var embedRegistry = map[string]EmbedProviderFactory{}

func Register(name string, factory ProviderFactory) {
	key := strings.ToLower(strings.TrimSpace(name))
	if key == "" || factory == nil {
		return
	}
	registry[key] = factory
}

func RegisterEmbed(name string, factory EmbedProviderFactory) {
	key := strings.ToLower(strings.TrimSpace(name))
	if key == "" || factory == nil {
		return
	}
	embedRegistry[key] = factory
}

func NewProvider(name string, args interface{}) (IAIProvider, error) {
	key := strings.ToLower(strings.TrimSpace(name))
	if key == "" {
		return nil, fmt.Errorf("ai.provider is required")
	}
	factory := registry[key]
	if factory == nil {
		return nil, fmt.Errorf("unsupported ai provider: %s", name)
	}
	return factory(args)
}

func NewEmbedProvider(name string, args interface{}) (IEmbedProvider, error) {
	key := strings.ToLower(strings.TrimSpace(name))
	if key == "" {
		return nil, fmt.Errorf("ai.provider is required")
	}
	factory := embedRegistry[key]
	if factory == nil {
		return nil, fmt.Errorf("unsupported embed provider: %s", name)
	}
	return factory(args)
}
