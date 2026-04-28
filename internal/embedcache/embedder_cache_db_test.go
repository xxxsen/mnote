package embedcache

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
)

type mockCacheStore struct {
	getResult []float32
	getOK     bool
	getErr    error
	saveErr   error
	saveCalls int
}

func (m *mockCacheStore) Get(
	_ context.Context, _, _, _ string,
) ([]float32, bool, error) {
	return m.getResult, m.getOK, m.getErr
}

func (m *mockCacheStore) Save(_ context.Context, _ *model.EmbeddingCache) error {
	m.saveCalls++
	return m.saveErr
}

func TestWrapDBCacheToEmbedder_NilInputs(t *testing.T) {
	assert.Nil(t, WrapDBCacheToEmbedder(nil, nil))

	e := &fakeEmbedder{model: "test"}
	assert.Equal(t, e, WrapDBCacheToEmbedder(e, nil))
}

func TestWrapDBCacheToEmbedder_NilEmbedder(t *testing.T) {
	store := &mockCacheStore{}
	assert.Nil(t, WrapDBCacheToEmbedder(nil, store))
}

func TestWrapDBCacheToEmbedder_Valid(t *testing.T) {
	e := &fakeEmbedder{model: "test"}
	store := &mockCacheStore{}
	wrapped := WrapDBCacheToEmbedder(e, store)
	assert.NotNil(t, wrapped)
	assert.NotEqual(t, e, wrapped)
}

func TestDBEmbedder_ModelName_Nil(t *testing.T) {
	d := &dbEmbedder{}
	assert.Empty(t, d.ModelName())
}

func TestDBEmbedder_ModelName_WithNext(t *testing.T) {
	d := &dbEmbedder{next: &fakeEmbedder{model: "embed-model"}}
	assert.Equal(t, "embed-model", d.ModelName())
}

func TestDBEmbedder_Embed_NilSelf(t *testing.T) {
	var d *dbEmbedder
	vec, err := d.Embed(context.TODO(), "text", "search")
	assert.NoError(t, err)
	assert.Nil(t, vec)
}

func TestDBEmbedder_Embed_NilNext(t *testing.T) {
	d := &dbEmbedder{next: nil}
	vec, err := d.Embed(context.TODO(), "text", "search")
	assert.NoError(t, err)
	assert.Nil(t, vec)
}

func TestDBEmbedder_Embed_CacheHit(t *testing.T) {
	store := &mockCacheStore{
		getResult: []float32{0.1, 0.2},
		getOK:     true,
	}
	inner := &fakeEmbedder{result: []float32{0.9, 0.8}, model: "m"}
	d := &dbEmbedder{next: inner, repo: store}
	vec, err := d.Embed(context.Background(), "hello", "search")
	require.NoError(t, err)
	assert.Equal(t, []float32{0.1, 0.2}, vec)
	assert.Equal(t, 0, inner.callCount, "inner should not be called on cache hit")
}

func TestDBEmbedder_Embed_CacheMiss(t *testing.T) {
	store := &mockCacheStore{getOK: false}
	inner := &fakeEmbedder{result: []float32{0.5, 0.6}, model: "m"}
	d := &dbEmbedder{next: inner, repo: store}
	vec, err := d.Embed(context.Background(), "hello", "search")
	require.NoError(t, err)
	assert.Equal(t, []float32{0.5, 0.6}, vec)
	assert.Equal(t, 1, inner.callCount)
	assert.Equal(t, 1, store.saveCalls, "result should be cached")
}

func TestDBEmbedder_Embed_CacheGetError(t *testing.T) {
	store := &mockCacheStore{getErr: errors.New("db error")}
	inner := &fakeEmbedder{result: []float32{0.5}, model: "m"}
	d := &dbEmbedder{next: inner, repo: store}
	_, err := d.Embed(context.Background(), "hello", "search")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "get embedding cache")
}

func TestDBEmbedder_Embed_NextError(t *testing.T) {
	store := &mockCacheStore{getOK: false}
	inner := &fakeEmbedder{model: "m"}
	inner.result = nil
	d := &dbEmbedder{next: inner, repo: store}

	errInner := &errorEmbedder2{}
	d2 := &dbEmbedder{next: errInner, repo: store}
	_, err := d2.Embed(context.Background(), "hello", "search")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "embed via next")

	_ = d
}

func TestDBEmbedder_Embed_SaveError(t *testing.T) {
	store := &mockCacheStore{getOK: false, saveErr: errors.New("save fail")}
	inner := &fakeEmbedder{result: []float32{0.5}, model: "m"}
	d := &dbEmbedder{next: inner, repo: store}
	vec, err := d.Embed(context.Background(), "hello", "search")
	require.NoError(t, err, "save error should be logged, not returned")
	assert.Equal(t, []float32{0.5}, vec)
	assert.Equal(t, 1, store.saveCalls)
}

func TestDBEmbedder_Embed_NilRepo(t *testing.T) {
	inner := &fakeEmbedder{result: []float32{0.5}, model: "m"}
	d := &dbEmbedder{next: inner, repo: nil}
	vec, err := d.Embed(context.Background(), "hello", "search")
	require.NoError(t, err)
	assert.Equal(t, []float32{0.5}, vec)
}

type errorEmbedder2 struct{}

func (e *errorEmbedder2) Embed(_ context.Context, _, _ string) ([]float32, error) {
	return nil, errors.New("next embed failed")
}

func (e *errorEmbedder2) ModelName() string { return "err" }
