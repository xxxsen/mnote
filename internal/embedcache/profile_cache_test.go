package embedcache

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/ai"
	"github.com/xxxsen/mnote/internal/model"
)

type fakeProfileEmbedder struct {
	mu      sync.Mutex
	profile ai.ProfileIdentity
	result  ai.EmbeddingResult
	err     error
	calls   int
	wait    chan struct{}
	started chan struct{}
}

func (embedder *fakeProfileEmbedder) Profile() ai.ProfileIdentity {
	return embedder.profile
}

func (embedder *fakeProfileEmbedder) EmbedBatch(
	_ context.Context,
	_ ai.EmbeddingRequest,
) (ai.EmbeddingResult, error) {
	embedder.mu.Lock()
	embedder.calls++
	embedder.mu.Unlock()
	if embedder.started != nil {
		select {
		case embedder.started <- struct{}{}:
		default:
		}
	}
	if embedder.wait != nil {
		<-embedder.wait
	}
	embedder.mu.Lock()
	defer embedder.mu.Unlock()
	return embedder.result, embedder.err
}

type fakeProfileCacheStore struct {
	value       []float32
	ok          bool
	getErr      error
	saveErr     error
	deleteCalls int
	saveCalls   int
}

func (store *fakeProfileCacheStore) Get(
	context.Context,
	string,
	string,
	string,
	int64,
) ([]float32, bool, error) {
	return store.value, store.ok, store.getErr
}

func (store *fakeProfileCacheStore) Save(
	context.Context,
	model.EmbeddingCacheV2,
) error {
	store.saveCalls++
	return store.saveErr
}

func (store *fakeProfileCacheStore) Delete(
	context.Context,
	string,
	string,
	string,
) error {
	store.deleteCalls++
	return nil
}

func cachedTestProfile() ai.ProfileIdentity {
	return ai.ProfileIdentity{
		ID:          "profile",
		Fingerprint: "fingerprint",
		SpaceID:     "space",
		Model:       "model",
		Dimensions:  2,
	}
}

func TestCachedProfileEmbedder_DBFailureIsFailOpenAndLRUHits(t *testing.T) {
	inner := &fakeProfileEmbedder{
		profile: cachedTestProfile(),
		result: ai.EmbeddingResult{
			Vectors:      [][]float32{{1, 0}},
			ProviderName: "provider",
		},
	}
	store := &fakeProfileCacheStore{
		getErr:  errors.New("database unavailable"),
		saveErr: errors.New("database unavailable"),
	}
	embedder := NewCachedProfileEmbedder(inner, store, 10, time.Hour)
	request := ai.EmbeddingRequest{Inputs: []string{"content"}, TaskType: "document"}
	first, err := embedder.EmbedBatch(context.Background(), request)
	require.NoError(t, err)
	assert.Equal(t, [][]float32{{1, 0}}, first.Vectors)
	second, err := embedder.EmbedBatch(context.Background(), request)
	require.NoError(t, err)
	assert.Equal(t, [][]float32{{1, 0}}, second.Vectors)
	assert.Equal(t, 1, inner.calls)
	assert.Equal(t, 1, store.saveCalls)
}

func TestCachedProfileEmbedder_InvalidDBEntryIsDeleted(t *testing.T) {
	inner := &fakeProfileEmbedder{
		profile: cachedTestProfile(),
		result: ai.EmbeddingResult{
			Vectors: [][]float32{{1, 0}},
		},
	}
	store := &fakeProfileCacheStore{
		value: []float32{1},
		ok:    true,
	}
	embedder := NewCachedProfileEmbedder(inner, store, 10, time.Hour)
	_, err := embedder.EmbedBatch(context.Background(), ai.EmbeddingRequest{
		Inputs: []string{"content"},
	})
	require.NoError(t, err)
	assert.Equal(t, 1, store.deleteCalls)
	assert.Equal(t, 1, inner.calls)
}

func TestValidCachedVectorRejectsZeroAndNonFiniteVectors(t *testing.T) {
	assert.False(t, validCachedVector([]float32{0, 0}, 2))
	assert.False(t, validCachedVector([]float32{1}, 2))
	assert.True(t, validCachedVector([]float32{1, 0}, 2))
}

func TestCachedProfileEmbedder_ConcurrentSameKeyUsesOneProviderCall(t *testing.T) {
	gate := make(chan struct{})
	started := make(chan struct{}, 1)
	inner := &fakeProfileEmbedder{
		profile: cachedTestProfile(),
		result: ai.EmbeddingResult{
			Vectors:      [][]float32{{1, 0}},
			ProviderName: "provider",
		},
		wait:    gate,
		started: started,
	}
	embedder := NewCachedProfileEmbedder(inner, nil, 10, time.Hour)
	request := ai.EmbeddingRequest{
		Inputs:   []string{"same content"},
		TaskType: "document",
	}

	const callers = 10
	var waitGroup sync.WaitGroup
	waitGroup.Add(callers)
	errorsByCaller := make(chan error, callers)
	for range callers {
		go func() {
			defer waitGroup.Done()
			result, err := embedder.EmbedBatch(context.Background(), request)
			if err == nil && !assert.ObjectsAreEqual(
				[][]float32{{1, 0}},
				result.Vectors,
			) {
				err = errors.New("unexpected embedding result")
			}
			errorsByCaller <- err
		}()
	}
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("provider call did not start")
	}
	close(gate)
	waitGroup.Wait()
	close(errorsByCaller)
	for err := range errorsByCaller {
		require.NoError(t, err)
	}
	assert.Equal(t, 1, inner.calls)
}
