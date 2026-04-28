package ai

import (
	"context"
	"fmt"
	"strings"
)

type IProvider interface {
	Name() string
	Generate(ctx context.Context, model, prompt string) (string, error)
	Embed(ctx context.Context, model, text, taskType string) ([]float32, error)
}

type IGenerator interface {
	Generate(ctx context.Context, prompt string) (string, error)
}

type IEmbedder interface {
	Embed(ctx context.Context, text, taskType string) ([]float32, error)
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
	res, err := g.provider.Generate(ctx, g.model, prompt)
	if err != nil {
		return "", fmt.Errorf("generate: %w", err)
	}
	return res, nil
}

type embedder struct {
	provider IProvider
	model    string
}

func NewEmbedder(p IProvider, model string) IEmbedder {
	return &embedder{provider: p, model: model}
}

func (e *embedder) Embed(ctx context.Context, text, taskType string) ([]float32, error) {
	res, err := e.provider.Embed(ctx, e.model, text, taskType)
	if err != nil {
		return nil, fmt.Errorf("embed: %w", err)
	}
	return res, nil
}

func (e *embedder) ModelName() string {
	return e.model
}

type ProviderFactory func(args any) (IProvider, error)

var registry = map[string]ProviderFactory{}

func Register(name string, factory ProviderFactory) {
	key := strings.ToLower(strings.TrimSpace(name))
	if key == "" || factory == nil {
		return
	}
	registry[key] = factory
}

func NewProvider(name string, args any) (IProvider, error) {
	key := strings.ToLower(strings.TrimSpace(name))
	if key == "" {
		return nil, ErrProviderRequired
	}
	factory := registry[key]
	if factory == nil {
		return nil, fmt.Errorf("%w: %s", ErrNotConfigured, name)
	}
	return factory(args)
}
