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

type ProviderFactory func(args interface{}) (IAIProvider, error)

var registry = map[string]ProviderFactory{}

func Register(name string, factory ProviderFactory) {
	key := strings.ToLower(strings.TrimSpace(name))
	if key == "" || factory == nil {
		return
	}
	registry[key] = factory
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
