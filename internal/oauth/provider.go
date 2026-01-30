package oauth

import (
	"context"
	"fmt"
	"strings"
)

type Profile struct {
	Provider       string
	ProviderUserID string
	Email          string
}

type Provider interface {
	Name() string
	AuthURL(state string) (string, error)
	ExchangeCode(ctx context.Context, code string) (*Profile, error)
}

type ProviderFactory func(args interface{}) (Provider, error)

var registry = map[string]ProviderFactory{}

func Register(name string, factory ProviderFactory) {
	key := strings.ToLower(strings.TrimSpace(name))
	if key == "" || factory == nil {
		return
	}
	registry[key] = factory
}

func NewProvider(name string, args interface{}) (Provider, error) {
	key := strings.ToLower(strings.TrimSpace(name))
	if key == "" {
		return nil, fmt.Errorf("oauth provider is required")
	}
	factory := registry[key]
	if factory == nil {
		return nil, fmt.Errorf("unsupported oauth provider: %s", name)
	}
	return factory(args)
}
