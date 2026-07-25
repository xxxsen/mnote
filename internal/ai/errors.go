package ai

import "errors"

var errComponentNotConfigured = errors.New("ai component not configured")

var (
	ErrUnavailable      = errors.New("ai unavailable")
	ErrNoEmbeddings     = errors.New("ai response has no embeddings")
	ErrNotConfigured    = errors.Join(ErrUnavailable, errComponentNotConfigured)
	ErrProviderRequired = errors.New("ai.provider is required")
	ErrConfigRequired   = errors.New("ai provider config is required")
	ErrRequestFailed    = errors.New("ai request failed")
)
