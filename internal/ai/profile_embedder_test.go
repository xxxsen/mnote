package ai

import (
	"context"
	"errors"
	"math"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
)

type fakeBatchProvider struct {
	name    string
	vectors [][]float32
	err     error
	wait    bool
	calls   int
}

func (provider *fakeBatchProvider) Name() string {
	return provider.name
}

func (provider *fakeBatchProvider) Embed(
	ctx context.Context,
	model, input, taskType string,
) ([]float32, error) {
	vectors, err := provider.EmbedBatch(
		ctx,
		model,
		0,
		[]string{input},
		taskType,
	)
	if err != nil {
		return nil, err
	}
	return vectors[0], nil
}

func (provider *fakeBatchProvider) EmbedBatch(
	ctx context.Context,
	_ string,
	_ int,
	_ []string,
	_ string,
) ([][]float32, error) {
	provider.calls++
	if provider.wait {
		<-ctx.Done()
		return nil, ctx.Err()
	}
	return provider.vectors, provider.err
}

type fakeCooldownStore struct {
	mu       sync.Mutex
	items    map[string]model.EmbeddingProviderCooldown
	getErr   error
	saveCall int
}

func (store *fakeCooldownStore) GetCooldown(
	_ context.Context,
	profileID, providerName string,
) (*model.EmbeddingProviderCooldown, bool, error) {
	if store.getErr != nil {
		return nil, false, store.getErr
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	item, ok := store.items[profileID+"/"+providerName]
	if !ok {
		return nil, false, nil
	}
	return &item, true, nil
}

func (store *fakeCooldownStore) SaveCooldown(
	_ context.Context,
	item model.EmbeddingProviderCooldown,
) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.items == nil {
		store.items = make(map[string]model.EmbeddingProviderCooldown)
	}
	store.items[item.ProfileID+"/"+item.ProviderName] = item
	store.saveCall++
	return nil
}

func testProfileIdentity() ProfileIdentity {
	return ProfileIdentity{
		ID:               "profile",
		Fingerprint:      "fingerprint",
		SpaceID:          "space",
		Model:            "model",
		Dimensions:       2,
		QueryTaskType:    "query",
		DocumentTaskType: "document",
	}
}

func TestProfileEmbedder_BatchFallbackAndValidation(t *testing.T) {
	first := &fakeBatchProvider{
		name: "first",
		err: &ProviderError{
			Code:    ErrorTransport,
			Message: "transport failed",
		},
	}
	second := &fakeBatchProvider{
		name:    "second",
		vectors: [][]float32{{1, 0}, {0, 1}},
	}
	embedder, err := NewProfileEmbedder(
		testProfileIdentity(),
		[]ProfileProvider{
			{Name: "first", Provider: first},
			{Name: "second", Provider: second},
		},
		time.Second,
		nil,
	)
	require.NoError(t, err)
	result, err := embedder.EmbedBatch(context.Background(), EmbeddingRequest{
		Inputs:   []string{"a", "b"},
		TaskType: "document",
	})
	require.NoError(t, err)
	assert.Equal(t, "second", result.ProviderName)
	assert.Equal(t, [][]float32{{1, 0}, {0, 1}}, result.Vectors)
	assert.Equal(t, 1, first.calls)
	assert.Equal(t, 1, second.calls)
}

func TestProfileEmbedder_PermanentAndRateLimitDoNotFallback(t *testing.T) {
	for _, testCase := range []struct {
		name string
		code ErrorCode
	}{
		{name: "invalid config", code: ErrorInvalidConfig},
		{name: "invalid request", code: ErrorInvalidRequest},
		{name: "unauthorized", code: ErrorUnauthorized},
		{name: "rate limited", code: ErrorRateLimited},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			first := &fakeBatchProvider{
				name: "first",
				err: &ProviderError{
					Code:       testCase.code,
					Message:    "stable error",
					RetryAfter: time.Minute,
				},
			}
			second := &fakeBatchProvider{
				name:    "second",
				vectors: [][]float32{{1, 0}},
			}
			cooldowns := &fakeCooldownStore{}
			embedder, err := NewProfileEmbedder(
				testProfileIdentity(),
				[]ProfileProvider{
					{Name: "first", Provider: first},
					{Name: "second", Provider: second},
				},
				time.Second,
				cooldowns,
			)
			require.NoError(t, err)
			_, err = embedder.EmbedBatch(context.Background(), EmbeddingRequest{
				Inputs: []string{"a"},
			})
			require.Error(t, err)
			assert.Zero(t, second.calls)
			if testCase.code == ErrorRateLimited {
				assert.Equal(t, 1, cooldowns.saveCall)
			}
		})
	}
}

func TestProfileEmbedder_InvalidVectorsFallback(t *testing.T) {
	tests := [][][]float32{
		{},
		{{1}},
		{{0, 0}},
		{{float32(math.NaN()), 0}},
		{{float32(math.Inf(1)), 0}},
	}
	for _, invalid := range tests {
		first := &fakeBatchProvider{name: "first", vectors: invalid}
		second := &fakeBatchProvider{name: "second", vectors: [][]float32{{1, 0}}}
		embedder, err := NewProfileEmbedder(
			testProfileIdentity(),
			[]ProfileProvider{
				{Name: "first", Provider: first},
				{Name: "second", Provider: second},
			},
			time.Second,
			nil,
		)
		require.NoError(t, err)
		result, err := embedder.EmbedBatch(context.Background(), EmbeddingRequest{
			Inputs: []string{"a"},
		})
		require.NoError(t, err)
		assert.Equal(t, "second", result.ProviderName)
	}
}

func TestProfileEmbedder_TimeoutAndCooldownReadFailOpen(t *testing.T) {
	first := &fakeBatchProvider{name: "first", wait: true}
	second := &fakeBatchProvider{name: "second", vectors: [][]float32{{1, 0}}}
	embedder, err := NewProfileEmbedder(
		testProfileIdentity(),
		[]ProfileProvider{
			{Name: "first", Provider: first},
			{Name: "second", Provider: second},
		},
		10*time.Millisecond,
		&fakeCooldownStore{getErr: errors.New("database unavailable")},
	)
	require.NoError(t, err)
	result, err := embedder.EmbedBatch(context.Background(), EmbeddingRequest{
		Inputs: []string{"a"},
	})
	require.NoError(t, err)
	assert.Equal(t, "second", result.ProviderName)
}
