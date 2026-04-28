package oauth

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

var (
	ErrProviderRequired = errors.New("oauth provider is required")
	ErrUnsupportedOAuth = errors.New("unsupported oauth provider")
	ErrRequestFailed    = errors.New("oauth request failed")
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

type ProviderFactory func(args any) (Provider, error)

var registry = map[string]ProviderFactory{}

func Register(name string, factory ProviderFactory) {
	key := strings.ToLower(strings.TrimSpace(name))
	if key == "" || factory == nil {
		return
	}
	registry[key] = factory
}

func NewProvider(name string, args any) (Provider, error) {
	key := strings.ToLower(strings.TrimSpace(name))
	if key == "" {
		return nil, ErrProviderRequired
	}
	factory := registry[key]
	if factory == nil {
		return nil, fmt.Errorf("%w: %s", ErrUnsupportedOAuth, name)
	}
	return factory(args)
}
