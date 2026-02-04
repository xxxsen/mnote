package ai

import (
	"context"
	"fmt"
	"strings"
)

type IProvider interface {
	Name() string
	Generate(ctx context.Context, model string, prompt string) (string, error)
	Embed(ctx context.Context, model string, text string, taskType string) ([]float32, error)
}

type IGenerator interface {
	Generate(ctx context.Context, prompt string) (string, error)
}

type IEmbedder interface {
	Embed(ctx context.Context, text string, taskType string) ([]float32, error)
	ModelName() string
}

type generator struct {
	provider IProvider
	model    string
}

func NewGenerator(p IProvider, model string) IGenerator {
	return &generator{provider: p, model: model}
}

func (g *generator) Generate(ctx context.Context, prompt string) (string, error) {
	return g.provider.Generate(ctx, g.model, prompt)
}

type embedder struct {
	provider IProvider
	model    string
}

func NewEmbedder(p IProvider, model string) IEmbedder {
	return &embedder{provider: p, model: model}
}

func (e *embedder) Embed(ctx context.Context, text string, taskType string) ([]float32, error) {
	return e.provider.Embed(ctx, e.model, text, taskType)
}

func (e *embedder) ModelName() string {
	return e.model
}

type ProviderFactory func(args interface{}) (IProvider, error)

var registry = map[string]ProviderFactory{}

func Register(name string, factory ProviderFactory) {
	key := strings.ToLower(strings.TrimSpace(name))
	if key == "" || factory == nil {
		return
	}
	registry[key] = factory
}

func NewProvider(name string, args interface{}) (IProvider, error) {
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
