package ai

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubProvider struct {
	name     string
	embedVec []float32
	embedErr error
}

func (s *stubProvider) Name() string { return s.name }

func (s *stubProvider) Embed(_ context.Context, _, _, _ string) ([]float32, error) {
	return s.embedVec, s.embedErr
}

func TestNewEmbedder_Embed(t *testing.T) {
	p := &stubProvider{embedVec: []float32{0.1, 0.2}}
	emb := NewEmbedder(p, "embed-model")
	result, err := emb.Embed(context.Background(), "text", "search")
	require.NoError(t, err)
	assert.Equal(t, []float32{0.1, 0.2}, result)
}

func TestNewEmbedder_ModelName(t *testing.T) {
	emb := NewEmbedder(&stubProvider{}, "my-model")
	assert.Equal(t, "my-model", emb.ModelName())
}

func TestRegister_EmptyName(t *testing.T) {
	before := len(registry)
	Register("", func(_ any) (IProvider, error) { return nil, ErrNotConfigured })
	assert.Equal(t, before, len(registry))
}

func TestNewProvider_EmptyName(t *testing.T) {
	_, err := NewProvider("", nil)
	assert.ErrorIs(t, err, ErrProviderRequired)
}

func TestNewProvider_UnknownProvider(t *testing.T) {
	_, err := NewProvider("nonexistent_provider_xyz", nil)
	assert.ErrorIs(t, err, ErrNotConfigured)
}

func TestNewEmbedder_EmbedError(t *testing.T) {
	p := &stubProvider{embedErr: errors.New("embed fail")}
	emb := NewEmbedder(p, "model")
	_, err := emb.Embed(context.Background(), "text", "search")
	assert.Error(t, err)
}
