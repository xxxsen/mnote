package embedcache

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/ai"
)

type fakeEmbedder struct {
	callCount int
	result    []float32
	model     string
}

func (f *fakeEmbedder) Embed(_ context.Context, _, _ string) ([]float32, error) {
	f.callCount++
	return f.result, nil
}

func (f *fakeEmbedder) ModelName() string { return f.model }

func TestWrapLruCacheToEmbedder_NilInputs(t *testing.T) {
	assert.Nil(t, WrapLruCacheToEmbedder(nil, 10, time.Hour))

	e := &fakeEmbedder{model: "test"}
	assert.Equal(t, e, WrapLruCacheToEmbedder(e, 0, time.Hour))
	assert.Equal(t, e, WrapLruCacheToEmbedder(e, 10, 0))
}

func TestLruEmbedder_CachesResults(t *testing.T) {
	inner := &fakeEmbedder{result: []float32{0.1, 0.2, 0.3}, model: "test-model"}
	wrapped := WrapLruCacheToEmbedder(inner, 100, time.Hour)

	ctx := context.Background()
	r1, err := wrapped.Embed(ctx, "hello", "search")
	require.NoError(t, err)
	assert.Equal(t, []float32{0.1, 0.2, 0.3}, r1)
	assert.Equal(t, 1, inner.callCount)

	r2, err := wrapped.Embed(ctx, "hello", "search")
	require.NoError(t, err)
	assert.Equal(t, []float32{0.1, 0.2, 0.3}, r2)
	assert.Equal(t, 1, inner.callCount, "should use cache")
}

func TestLruEmbedder_DifferentKeys(t *testing.T) {
	inner := &fakeEmbedder{result: []float32{1.0}, model: "m"}
	wrapped := WrapLruCacheToEmbedder(inner, 100, time.Hour)

	ctx := context.Background()
	_, _ = wrapped.Embed(ctx, "a", "t1")
	_, _ = wrapped.Embed(ctx, "b", "t1")
	assert.Equal(t, 2, inner.callCount)
}

func TestLruEmbedder_ModelName(t *testing.T) {
	inner := &fakeEmbedder{model: "my-model"}
	wrapped := WrapLruCacheToEmbedder(inner, 10, time.Hour)
	assert.Equal(t, "my-model", wrapped.ModelName())
}

func TestCloneEmbedding(t *testing.T) {
	original := []float32{1.0, 2.0, 3.0}
	clone := cloneEmbedding(original)
	assert.Equal(t, original, clone)

	clone[0] = 999.0
	assert.NotEqual(t, original[0], clone[0], "modifying clone should not affect original")
}

func TestCloneEmbedding_Empty(t *testing.T) {
	assert.Nil(t, cloneEmbedding(nil))
	assert.Nil(t, cloneEmbedding([]float32{}))
}

func TestBuildCacheKey(t *testing.T) {
	key, hash, model := buildCacheKey("model1", "search", "text")
	assert.Contains(t, key, "model1")
	assert.Contains(t, key, "search")
	assert.NotEmpty(t, hash)
	assert.Equal(t, "model1", model)
}

func TestBuildCacheKey_EmptyModel(t *testing.T) {
	_, _, model := buildCacheKey("", "search", "text")
	assert.Equal(t, "unknown", model)
}

func TestLruEmbedder_NilSelf(t *testing.T) {
	var l *lruEmbedder
	vec, err := l.Embed(context.Background(), "text", "search")
	assert.NoError(t, err)
	assert.Nil(t, vec)
}

func TestLruEmbedder_NilNext(t *testing.T) {
	l := &lruEmbedder{next: nil}
	vec, err := l.Embed(context.Background(), "text", "search")
	assert.NoError(t, err)
	assert.Nil(t, vec)
}

func TestLruEmbedder_ModelName_Nil(t *testing.T) {
	var l *lruEmbedder
	assert.Empty(t, l.ModelName())
}

func TestLruEmbedder_ModelName_NilNext(t *testing.T) {
	l := &lruEmbedder{next: nil}
	assert.Empty(t, l.ModelName())
}

func TestLruEmbedder_EmbedError(t *testing.T) {
	inner := &fakeEmbedder{result: nil, model: "m"}
	inner.result = nil
	wrapped := WrapLruCacheToEmbedder(&errorEmbedder{}, 100, time.Hour)

	_, err := wrapped.Embed(context.Background(), "text", "search")
	assert.Error(t, err)
}

type errorEmbedder struct{}

func (e *errorEmbedder) Embed(_ context.Context, _, _ string) ([]float32, error) {
	return nil, assert.AnError
}

func (e *errorEmbedder) ModelName() string { return "err-model" }

var _ ai.IEmbedder = (*fakeEmbedder)(nil)
