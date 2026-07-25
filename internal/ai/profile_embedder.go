package ai

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/xxxsen/common/logutil"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/metrics"
	"github.com/xxxsen/mnote/internal/model"
)

type ProfileProvider struct {
	Name     string
	Provider IProvider
}

type ProviderCooldownStore interface {
	GetCooldown(
		ctx context.Context,
		profileID, providerName string,
	) (*model.EmbeddingProviderCooldown, bool, error)
	SaveCooldown(context.Context, model.EmbeddingProviderCooldown) error
}

type providerCircuit struct {
	failures     int
	blockedUntil time.Time
}

type profileEmbedder struct {
	profile      ProfileIdentity
	providers    []ProfileProvider
	timeout      time.Duration
	cooldowns    ProviderCooldownStore
	mu           sync.Mutex
	circuits     map[string]providerCircuit
	now          func() time.Time
	circuitLimit int
	circuitDelay time.Duration
}

func NewProfileEmbedder(
	profile ProfileIdentity,
	providers []ProfileProvider,
	timeout time.Duration,
	cooldowns ProviderCooldownStore,
) (ProfileEmbedder, error) {
	if profile.ID == "" || profile.Fingerprint == "" ||
		profile.SpaceID == "" || profile.Model == "" ||
		profile.Dimensions <= 0 {
		return nil, &ProviderError{
			Code:    ErrorInvalidConfig,
			Message: "profile identity is incomplete",
		}
	}
	if len(providers) == 0 {
		return nil, &ProviderError{
			Code:    ErrorInvalidConfig,
			Message: "profile has no providers",
		}
	}
	if timeout <= 0 {
		return nil, &ProviderError{
			Code:    ErrorInvalidConfig,
			Message: "request timeout must be positive",
		}
	}
	seen := make(map[string]struct{}, len(providers))
	for _, provider := range providers {
		if provider.Name == "" || provider.Provider == nil {
			return nil, &ProviderError{
				Code:    ErrorInvalidConfig,
				Message: "profile provider is incomplete",
			}
		}
		if _, exists := seen[provider.Name]; exists {
			return nil, &ProviderError{
				Code:    ErrorInvalidConfig,
				Message: "profile provider is duplicated",
			}
		}
		seen[provider.Name] = struct{}{}
		if _, ok := provider.Provider.(IBatchProvider); !ok {
			return nil, &ProviderError{
				Code:    ErrorInvalidConfig,
				Message: "profile provider does not support batch embedding",
			}
		}
	}
	return &profileEmbedder{
		profile:      profile,
		providers:    providers,
		timeout:      timeout,
		cooldowns:    cooldowns,
		circuits:     make(map[string]providerCircuit),
		now:          time.Now,
		circuitLimit: 3,
		circuitDelay: 30 * time.Second,
	}, nil
}

func (e *profileEmbedder) Profile() ProfileIdentity {
	return e.profile
}

func (e *profileEmbedder) EmbedBatch(
	ctx context.Context,
	request EmbeddingRequest,
) (EmbeddingResult, error) {
	if len(request.Inputs) == 0 {
		return EmbeddingResult{Vectors: [][]float32{}}, nil
	}
	if err := validateEmbeddingInputs(request.Inputs); err != nil {
		return EmbeddingResult{}, err
	}

	var lastErr error
	now := e.now()
	for _, endpoint := range e.providers {
		if err := ctx.Err(); err != nil {
			return EmbeddingResult{}, classifyTransportError(err)
		}
		blocked, err := e.providerBlocked(ctx, endpoint.Name, now)
		if err != nil {
			logutil.GetLogger(ctx).Warn(
				"embedding cooldown read failed; continuing fail-open",
				zap.String("profile", e.profile.ID),
				zap.String("provider", endpoint.Name),
			)
		}
		if blocked {
			continue
		}

		result, err := e.callProvider(ctx, endpoint, request)
		if err == nil {
			e.recordProviderSuccess(endpoint.Name)
			return result, nil
		}

		lastErr = err
		code, retryAfter, _ := ErrorDetails(err)
		switch {
		case code == ErrorCanceled:
			return EmbeddingResult{}, err
		case code == ErrorRateLimited:
			if retryAfter <= 0 {
				retryAfter = 60 * time.Second
				var providerErr *ProviderError
				if errors.As(err, &providerErr) {
					providerErr.RetryAfter = retryAfter
				}
			}
			e.saveCooldown(ctx, endpoint.Name, code, now.Add(retryAfter))
			metrics.SetEmbeddingProviderCooldown(
				endpoint.Name,
				retryAfter.Seconds(),
			)
			return EmbeddingResult{}, err
		case IsPermanentProviderError(err):
			return EmbeddingResult{}, err
		case IsFallbackProviderError(err):
			e.recordProviderFailure(endpoint.Name, now)
			continue
		default:
			return EmbeddingResult{}, err
		}
	}
	if lastErr == nil {
		lastErr = &ProviderError{
			Code:    ErrorTransport,
			Message: "all compatible providers are cooling down",
		}
	}
	return EmbeddingResult{}, lastErr
}

func validateEmbeddingInputs(inputs []string) error {
	for _, input := range inputs {
		if input == "" {
			return &ProviderError{
				Code:    ErrorInvalidRequest,
				Message: "embedding input must not be empty",
			}
		}
	}
	return nil
}

func (e *profileEmbedder) callProvider(
	ctx context.Context,
	endpoint ProfileProvider,
	request EmbeddingRequest,
) (EmbeddingResult, error) {
	provider, ok := endpoint.Provider.(IBatchProvider)
	if !ok {
		return EmbeddingResult{}, &ProviderError{
			Code:    ErrorInvalidConfig,
			Message: "profile provider does not support batch embedding",
		}
	}
	callCtx, cancel := context.WithTimeout(ctx, e.timeout)
	startedAt := e.now()
	vectors, err := provider.EmbedBatch(
		callCtx,
		e.profile.Model,
		e.profile.Dimensions,
		request.Inputs,
		request.TaskType,
	)
	cancel()
	if err == nil {
		err = validateEmbeddingVectors(
			vectors,
			len(request.Inputs),
			e.profile.Dimensions,
		)
		if err != nil {
			metrics.ObserveInvalidVector("provider_validation")
		}
	}
	err = normalizeProviderError(err)
	resultLabel := "success"
	if err != nil {
		code, _, _ := ErrorDetails(err)
		resultLabel = string(code)
	}
	metrics.ObserveEmbeddingProvider(
		endpoint.Name,
		resultLabel,
		e.now().Sub(startedAt),
	)
	if err != nil {
		return EmbeddingResult{}, err
	}
	return EmbeddingResult{
		Vectors:      vectors,
		ProviderName: endpoint.Name,
	}, nil
}

func (e *profileEmbedder) providerBlocked(
	ctx context.Context,
	providerName string,
	now time.Time,
) (bool, error) {
	e.mu.Lock()
	circuit := e.circuits[providerName]
	e.mu.Unlock()
	if circuit.blockedUntil.After(now) {
		return true, nil
	}
	if e.cooldowns == nil {
		return false, nil
	}
	cooldown, found, err := e.cooldowns.GetCooldown(
		ctx,
		e.profile.ID,
		providerName,
	)
	if err != nil {
		return false, fmt.Errorf("read embedding provider cooldown: %w", err)
	}
	return found && cooldown.BlockedUntil > now.Unix(), nil
}

func (e *profileEmbedder) saveCooldown(
	ctx context.Context,
	providerName string,
	code ErrorCode,
	until time.Time,
) {
	if e.cooldowns == nil {
		return
	}
	if err := e.cooldowns.SaveCooldown(ctx, model.EmbeddingProviderCooldown{
		ProfileID:     e.profile.ID,
		ProviderName:  providerName,
		BlockedUntil:  until.Unix(),
		LastErrorCode: string(code),
		Mtime:         e.now().Unix(),
	}); err != nil {
		logutil.GetLogger(ctx).Warn(
			"embedding cooldown write failed",
			zap.String("profile", e.profile.ID),
			zap.String("provider", providerName),
		)
	}
}

func (e *profileEmbedder) recordProviderSuccess(providerName string) {
	e.mu.Lock()
	delete(e.circuits, providerName)
	e.mu.Unlock()
}

func (e *profileEmbedder) recordProviderFailure(providerName string, now time.Time) {
	e.mu.Lock()
	defer e.mu.Unlock()
	state := e.circuits[providerName]
	state.failures++
	if state.failures >= e.circuitLimit {
		state.blockedUntil = now.Add(e.circuitDelay)
		state.failures = 0
	}
	e.circuits[providerName] = state
}

func validateEmbeddingVectors(
	vectors [][]float32,
	expectedCount, dimensions int,
) error {
	if len(vectors) != expectedCount {
		return &ProviderError{
			Code: ErrorInvalidResponse,
			Message: fmt.Sprintf(
				"returned %d vectors for %d inputs",
				len(vectors),
				expectedCount,
			),
		}
	}
	for _, vector := range vectors {
		if len(vector) != dimensions {
			return &ProviderError{
				Code: ErrorInvalidResponse,
				Message: fmt.Sprintf(
					"returned vector dimension %d; expected %d",
					len(vector),
					dimensions,
				),
			}
		}
		hasMagnitude := false
		for _, value := range vector {
			if math.IsNaN(float64(value)) || math.IsInf(float64(value), 0) {
				return &ProviderError{
					Code:    ErrorInvalidResponse,
					Message: "returned vector contains non-finite values",
				}
			}
			if value != 0 {
				hasMagnitude = true
			}
		}
		if !hasMagnitude {
			return &ProviderError{
				Code:    ErrorInvalidResponse,
				Message: "returned vector has zero magnitude",
			}
		}
	}
	return nil
}

func normalizeProviderError(err error) error {
	if err == nil {
		return nil
	}
	if _, _, ok := ErrorDetails(err); ok {
		return err
	}
	return classifyTransportError(err)
}

func classifyTransportError(err error) error {
	switch {
	case errors.Is(err, context.Canceled):
		return &ProviderError{
			Code:    ErrorCanceled,
			Message: "request was canceled",
			Cause:   err,
		}
	case errors.Is(err, context.DeadlineExceeded):
		return &ProviderError{
			Code:    ErrorTimeout,
			Message: "request timed out",
			Cause:   err,
		}
	}
	var networkErr net.Error
	if errors.As(err, &networkErr) && networkErr.Timeout() {
		return &ProviderError{
			Code:    ErrorTimeout,
			Message: "request timed out",
			Cause:   err,
		}
	}
	return &ProviderError{
		Code:    ErrorTransport,
		Message: "transport request failed",
		Cause:   err,
	}
}

func providerHTTPError(statusCode int, retryAfter time.Duration, cause error) error {
	code := ErrorInvalidRequest
	switch {
	case statusCode == http.StatusUnauthorized || statusCode == http.StatusForbidden:
		code = ErrorUnauthorized
	case statusCode == http.StatusRequestTimeout:
		code = ErrorTimeout
	case statusCode == http.StatusTooManyRequests:
		code = ErrorRateLimited
	case statusCode >= http.StatusInternalServerError:
		code = ErrorUpstream5xx
	}
	return &ProviderError{
		Code:       code,
		Message:    fmt.Sprintf("upstream returned HTTP %d", statusCode),
		RetryAfter: retryAfter,
		Cause:      cause,
	}
}
