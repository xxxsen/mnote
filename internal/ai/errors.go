package ai

import (
	"errors"
	"fmt"
	"time"
)

var errComponentNotConfigured = errors.New("ai component not configured")

var (
	ErrUnavailable      = errors.New("ai unavailable")
	ErrNoEmbeddings     = errors.New("ai response has no embeddings")
	ErrNotConfigured    = errors.Join(ErrUnavailable, errComponentNotConfigured)
	ErrProviderRequired = errors.New("ai.provider is required")
	ErrConfigRequired   = errors.New("ai provider config is required")
	ErrRequestFailed    = errors.New("ai request failed")
)

type ErrorCode string

const (
	ErrorInvalidConfig   ErrorCode = "invalid_config"
	ErrorInvalidRequest  ErrorCode = "invalid_request"
	ErrorUnauthorized    ErrorCode = "unauthorized"
	ErrorRateLimited     ErrorCode = "rate_limited"
	ErrorTimeout         ErrorCode = "timeout"
	ErrorTransport       ErrorCode = "transport"
	ErrorUpstream5xx     ErrorCode = "upstream_5xx"
	ErrorInvalidResponse ErrorCode = "invalid_response"
	ErrorCanceled        ErrorCode = "canceled"
)

type ProviderError struct {
	Code       ErrorCode
	Message    string
	RetryAfter time.Duration
	Cause      error
}

func (e *ProviderError) Error() string {
	if e == nil {
		return ""
	}
	if e.Message != "" {
		return fmt.Sprintf("embedding provider %s: %s", e.Code, e.Message)
	}
	return fmt.Sprintf("embedding provider %s", e.Code)
}

func (e *ProviderError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Cause
}

func ErrorDetails(err error) (ErrorCode, time.Duration, bool) {
	var providerErr *ProviderError
	if !errors.As(err, &providerErr) {
		return "", 0, false
	}
	return providerErr.Code, providerErr.RetryAfter, true
}

func IsPermanentProviderError(err error) bool {
	code, _, ok := ErrorDetails(err)
	return ok && (code == ErrorInvalidConfig ||
		code == ErrorInvalidRequest ||
		code == ErrorUnauthorized)
}

func IsFallbackProviderError(err error) bool {
	code, _, ok := ErrorDetails(err)
	return ok && (code == ErrorTimeout ||
		code == ErrorTransport ||
		code == ErrorUpstream5xx ||
		code == ErrorInvalidResponse)
}
