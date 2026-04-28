package ai

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGeminiProvider_Name(t *testing.T) {
	p := &geminiProvider{apiKey: "test"}
	assert.Equal(t, "gemini", p.Name())
}

func TestGeminiProvider_Generate_EmptyKey(t *testing.T) {
	p := &geminiProvider{}
	_, err := p.Generate(context.Background(), "model", "prompt")
	assert.ErrorIs(t, err, ErrUnavailable)
}

func TestGeminiProvider_Embed_EmptyKey(t *testing.T) {
	p := &geminiProvider{}
	_, err := p.Embed(context.Background(), "model", "text", "search")
	assert.ErrorIs(t, err, ErrUnavailable)
}

func TestCreateGeminiFactory_NilArgs(t *testing.T) {
	_, err := createGeminiFactory(nil)
	assert.ErrorIs(t, err, ErrConfigRequired)
}

func TestCreateGeminiFactory_EmptyKey(t *testing.T) {
	p, err := createGeminiFactory(map[string]any{"api_key": ""})
	require.NoError(t, err)
	assert.Equal(t, "gemini", p.Name())

	_, gErr := p.Generate(context.Background(), "m", "p")
	assert.ErrorIs(t, gErr, ErrUnavailable)

	_, eErr := p.Embed(context.Background(), "m", "t", "s")
	assert.ErrorIs(t, eErr, ErrUnavailable)
}

func TestCreateGeminiFactory_ValidKey(t *testing.T) {
	p, err := createGeminiFactory(map[string]any{"api_key": "  sk-test  "})
	require.NoError(t, err)
	gp, ok := p.(*geminiProvider)
	require.True(t, ok)
	assert.Equal(t, "sk-test", gp.apiKey, "api key should be trimmed")
}

func TestGeminiProvider_Generate_InvalidKey(t *testing.T) {
	p := &geminiProvider{apiKey: "invalid-key"}
	_, err := p.Generate(context.Background(), "gemini-pro", "hello")
	assert.Error(t, err)
}

func TestGeminiProvider_Embed_InvalidKey(t *testing.T) {
	p := &geminiProvider{apiKey: "invalid-key"}
	_, err := p.Embed(context.Background(), "text-embedding-004", "hello", "search")
	assert.Error(t, err)
}

func TestGeminiRegistered(t *testing.T) {
	_, err := NewProvider("gemini", map[string]any{"api_key": ""})
	require.NoError(t, err)
}

func TestDecodeConfig_NilArgs(t *testing.T) {
	assert.ErrorIs(t, decodeConfig(nil, &struct{}{}), ErrConfigRequired)
}

func TestDecodeConfig_ValidStruct(t *testing.T) {
	type cfg struct {
		Name string `json:"name"`
	}
	var c cfg
	err := decodeConfig(map[string]any{"name": "hello"}, &c)
	require.NoError(t, err)
	assert.Equal(t, "hello", c.Name)
}

func TestDecodeConfig_InvalidDst(t *testing.T) {
	var notPtr int
	err := decodeConfig(map[string]any{"x": 1}, &notPtr)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "decode ai provider config")
}

func TestDecodeConfig_UnmarshalError(t *testing.T) {
	err := decodeConfig(make(chan int), &struct{}{})
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "encode ai provider config")
}
