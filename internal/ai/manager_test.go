package ai

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestManager(gen *mockGenerator) *Manager {
	return NewManager(gen, gen, gen, gen, nil, ManagerConfig{
		Timeout:       5,
		MaxInputChars: 1000,
	})
}

func TestManager_Polish(t *testing.T) {
	m := newTestManager(&mockGenerator{result: "polished"})
	result, err := m.Polish(context.Background(), "rough text")
	require.NoError(t, err)
	assert.Equal(t, "polished", result)
}

func TestManager_Polish_NilGenerator(t *testing.T) {
	m := NewManager(nil, nil, nil, nil, nil, ManagerConfig{})
	_, err := m.Polish(context.Background(), "text")
	assert.ErrorIs(t, err, ErrNotConfigured)
}

func TestManager_Generate(t *testing.T) {
	m := newTestManager(&mockGenerator{result: "article"})
	result, err := m.Generate(context.Background(), "describe something")
	require.NoError(t, err)
	assert.Equal(t, "article", result)
}

func TestManager_Generate_NilGenerator(t *testing.T) {
	m := NewManager(nil, nil, nil, nil, nil, ManagerConfig{})
	_, err := m.Generate(context.Background(), "desc")
	assert.ErrorIs(t, err, ErrNotConfigured)
}

func TestManager_ExtractTags(t *testing.T) {
	m := newTestManager(&mockGenerator{result: `["go", "ai", "testing"]`})
	tags, err := m.ExtractTags(context.Background(), "some content about go and ai", 5)
	require.NoError(t, err)
	assert.Equal(t, []string{"go", "ai", "testing"}, tags)
}

func TestManager_ExtractTags_NilTagger(t *testing.T) {
	m := NewManager(nil, nil, nil, nil, nil, ManagerConfig{})
	_, err := m.ExtractTags(context.Background(), "text", 5)
	assert.ErrorIs(t, err, ErrNotConfigured)
}

func TestManager_ExtractTags_ClampMaxTags(t *testing.T) {
	m := newTestManager(&mockGenerator{result: `["a", "b", "c"]`})

	tags, err := m.ExtractTags(context.Background(), "text", 0)
	require.NoError(t, err)
	assert.Len(t, tags, 3)

	tags, err = m.ExtractTags(context.Background(), "text", 100)
	require.NoError(t, err)
	assert.Len(t, tags, 3)
}

func TestManager_Summarize(t *testing.T) {
	m := newTestManager(&mockGenerator{result: "a brief summary"})
	result, err := m.Summarize(context.Background(), "long content here")
	require.NoError(t, err)
	assert.Equal(t, "a brief summary", result)
}

func TestManager_Summarize_NilSummarizer(t *testing.T) {
	m := NewManager(nil, nil, nil, nil, nil, ManagerConfig{})
	_, err := m.Summarize(context.Background(), "text")
	assert.ErrorIs(t, err, ErrNotConfigured)
}

func TestManager_Embed(t *testing.T) {
	emb := &fakeEmbedImpl{vec: []float32{0.1, 0.2}}
	m := NewManager(nil, nil, nil, nil, emb, ManagerConfig{})
	result, err := m.Embed(context.Background(), "text", "search")
	require.NoError(t, err)
	assert.Equal(t, []float32{0.1, 0.2}, result)
}

func TestManager_Embed_Error(t *testing.T) {
	emb := &fakeEmbedImpl{err: errors.New("embed fail")}
	m := NewManager(nil, nil, nil, nil, emb, ManagerConfig{})
	_, err := m.Embed(context.Background(), "text", "search")
	assert.Error(t, err)
}

func TestManager_ExtractTags_Error(t *testing.T) {
	m := newTestManager(&mockGenerator{err: errors.New("fail")})
	_, err := m.ExtractTags(context.Background(), "text", 5)
	assert.Error(t, err)
}

func TestManager_GenerateText_NoTimeout(t *testing.T) {
	gen := &mockGenerator{result: "no timeout result"}
	m := NewManager(gen, gen, gen, gen, nil, ManagerConfig{Timeout: 0})
	result, err := m.Polish(context.Background(), "text")
	require.NoError(t, err)
	assert.Equal(t, "no timeout result", result)
}

func TestManager_Embed_NilEmbedder(t *testing.T) {
	m := NewManager(nil, nil, nil, nil, nil, ManagerConfig{})
	_, err := m.Embed(context.Background(), "text", "search")
	assert.ErrorIs(t, err, ErrNotConfigured)
}

func TestManager_EmbeddingModelName(t *testing.T) {
	emb := &fakeEmbedImpl{vec: nil}
	m := NewManager(nil, nil, nil, nil, emb, ManagerConfig{})
	assert.Equal(t, "fake", m.EmbeddingModelName())
}

func TestManager_EmbeddingModelName_NilEmbedder(t *testing.T) {
	m := NewManager(nil, nil, nil, nil, nil, ManagerConfig{})
	assert.Equal(t, "", m.EmbeddingModelName())
}

func TestManager_MaxInputChars(t *testing.T) {
	m := NewManager(nil, nil, nil, nil, nil, ManagerConfig{MaxInputChars: 500})
	assert.Equal(t, 500, m.MaxInputChars())
}

func TestManager_GenerateText_EmptyResponse(t *testing.T) {
	m := newTestManager(&mockGenerator{result: "  "})
	_, err := m.Polish(context.Background(), "text")
	assert.ErrorIs(t, err, ErrEmptyResponse)
}

func TestManager_GenerateText_Error(t *testing.T) {
	m := newTestManager(&mockGenerator{err: errors.New("api fail")})
	_, err := m.Polish(context.Background(), "text")
	assert.Error(t, err)
}

func TestParseTags(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		max     int
		want    []string
		wantErr bool
	}{
		{"simple", `["go", "rust"]`, 5, []string{"go", "rust"}, false},
		{"with_markdown", "```json\n[\"a\", \"b\"]\n```", 5, []string{"a", "b"}, false},
		{"dedup", `["Go", "go", "Go"]`, 10, []string{"Go"}, false},
		{"limit", `["a", "b", "c"]`, 2, []string{"a", "b"}, false},
		{"empty_tags", `["", " ", "valid"]`, 5, []string{"valid"}, false},
		{"no_tags", `[]`, 5, nil, true},
		{"invalid_json", `not json`, 5, nil, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseTags(tt.input, tt.max)
			if tt.wantErr {
				assert.Error(t, err)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}
