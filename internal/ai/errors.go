package ai

import "errors"

var errComponentNotConfigured = errors.New("ai component not configured")

var (
	ErrUnavailable      = errors.New("ai unavailable")
	ErrNoChoices        = errors.New("ai response has no choices")
	ErrNoEmbeddings     = errors.New("ai response has no embeddings")
	ErrEmptyResponse    = errors.New("empty ai response")
	ErrNotConfigured    = errors.Join(ErrUnavailable, errComponentNotConfigured)
	ErrProviderRequired = errors.New("ai.provider is required")
	ErrNoTags           = errors.New("no tags found")
	ErrConfigRequired   = errors.New("ai provider config is required")
	ErrRequestFailed    = errors.New("ai request failed")
)
