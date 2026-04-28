package ai

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewGroupGenerator_Empty(t *testing.T) {
	assert.Nil(t, NewGroupGenerator(nil))
	assert.Nil(t, NewGroupGenerator([]GeneratorEntry{}))
}

func TestGroupGenerator_FirstSuccess(t *testing.T) {
	gen := NewGroupGenerator([]GeneratorEntry{
		{Name: "a", Generator: &mockGenerator{result: "hello"}},
		{Name: "b", Generator: &mockGenerator{result: "world"}},
	})
	result, err := gen.Generate(context.Background(), "prompt")
	require.NoError(t, err)
	assert.Equal(t, "hello", result)
}

func TestGroupGenerator_Failover(t *testing.T) {
	gen := NewGroupGenerator([]GeneratorEntry{
		{Name: "bad", Generator: &mockGenerator{err: errors.New("fail")}},
		{Name: "good", Generator: &mockGenerator{result: "ok"}},
	})
	result, err := gen.Generate(context.Background(), "prompt")
	require.NoError(t, err)
	assert.Equal(t, "ok", result)
}

func TestGroupGenerator_AllFail(t *testing.T) {
	gen := NewGroupGenerator([]GeneratorEntry{
		{Name: "a", Generator: &mockGenerator{err: errors.New("err1")}},
		{Name: "b", Generator: &mockGenerator{err: errors.New("err2")}},
	})
	_, err := gen.Generate(context.Background(), "prompt")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "err2")
}

func TestGroupGenerator_NilGenerator(t *testing.T) {
	gen := NewGroupGenerator([]GeneratorEntry{
		{Name: "nil", Generator: nil},
		{Name: "ok", Generator: &mockGenerator{result: "found"}},
	})
	result, err := gen.Generate(context.Background(), "prompt")
	require.NoError(t, err)
	assert.Equal(t, "found", result)
}

func TestNewGroupEmbedder_Empty(t *testing.T) {
	assert.Nil(t, NewGroupEmbedder(nil))
}

func TestGroupEmbedder_FirstSuccess(t *testing.T) {
	emb := NewGroupEmbedder([]EmbedderEntry{
		{Name: "a", Embedder: &fakeEmbedImpl{vec: []float32{1.0}}},
	})
	result, err := emb.Embed(context.Background(), "text", "search")
	require.NoError(t, err)
	assert.Equal(t, []float32{1.0}, result)
}

func TestGroupEmbedder_Failover(t *testing.T) {
	emb := NewGroupEmbedder([]EmbedderEntry{
		{Name: "bad", Embedder: &fakeEmbedImpl{err: errors.New("fail")}},
		{Name: "good", Embedder: &fakeEmbedImpl{vec: []float32{0.5}}},
	})
	result, err := emb.Embed(context.Background(), "text", "search")
	require.NoError(t, err)
	assert.Equal(t, []float32{0.5}, result)
}

func TestGroupEmbedder_ModelName(t *testing.T) {
	emb := NewGroupEmbedder([]EmbedderEntry{
		{Name: "m1"},
		{Name: "m2"},
	})
	assert.Equal(t, "m1|m2", emb.ModelName())
}

func TestGroupEmbedder_ModelName_EmptyNames(t *testing.T) {
	emb := NewGroupEmbedder([]EmbedderEntry{
		{Name: ""},
		{Name: ""},
	})
	assert.Equal(t, "", emb.ModelName())
}

func TestGroupEmbedder_AllFail(t *testing.T) {
	emb := NewGroupEmbedder([]EmbedderEntry{
		{Name: "a", Embedder: &fakeEmbedImpl{err: errors.New("err1")}},
		{Name: "b", Embedder: &fakeEmbedImpl{err: errors.New("err2")}},
	})
	_, err := emb.Embed(context.Background(), "text", "search")
	assert.Error(t, err)
}

func TestGroupEmbedder_NilEmbedder(t *testing.T) {
	emb := NewGroupEmbedder([]EmbedderEntry{
		{Name: "nil", Embedder: nil},
		{Name: "ok", Embedder: &fakeEmbedImpl{vec: []float32{1.0}}},
	})
	result, err := emb.Embed(context.Background(), "text", "search")
	require.NoError(t, err)
	assert.Equal(t, []float32{1.0}, result)
}

func TestGroupEmbedder_AllNilNotConfigured(t *testing.T) {
	emb := NewGroupEmbedder([]EmbedderEntry{
		{Name: "nil1", Embedder: nil},
	})
	_, err := emb.Embed(context.Background(), "text", "search")
	assert.ErrorIs(t, err, ErrNotConfigured)
}

type fakeEmbedImpl struct {
	vec []float32
	err error
}

func (f *fakeEmbedImpl) Embed(_ context.Context, _, _ string) ([]float32, error) {
	return f.vec, f.err
}

func (f *fakeEmbedImpl) ModelName() string { return "fake" }
