package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/repo"
)

func noopLogger() *zap.Logger {
	return zap.NewNop()
}

// --- ai_service helpers ---

func TestClampDelay(t *testing.T) {
	assert.Equal(t, int64(0), clampDelay(-1))
	assert.Equal(t, int64(0), clampDelay(0))
	assert.Equal(t, int64(100), clampDelay(100))
}

func TestIsRateLimitErr(t *testing.T) {
	assert.True(t, isRateLimitErr(errors.New("rate limit exceeded")))
	assert.True(t, isRateLimitErr(errors.New("429 too many requests")))
	assert.True(t, isRateLimitErr(errors.New("API RATE LIMIT")))
	assert.False(t, isRateLimitErr(errors.New("internal error")))
}

func TestCheckCtx_Active(t *testing.T) {
	assert.NoError(t, checkCtx(context.Background()))
}

func TestCheckCtx_Canceled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	err := checkCtx(ctx)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "context canceled")
}

func TestWaitCtx_Normal(t *testing.T) {
	assert.NoError(t, waitCtx(context.Background(), time.Millisecond))
}

func TestWaitCtx_Canceled(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	err := waitCtx(ctx, time.Hour)
	assert.Error(t, err)
}

func TestGroupChunksByDoc(t *testing.T) {
	results := []repo.ChunkSearchResult{
		{DocumentID: "d1", Score: 0.9, ChunkType: model.ChunkTypeText},
		{DocumentID: "d1", Score: 0.8, ChunkType: model.ChunkTypeText},
		{DocumentID: "d2", Score: 0.7, ChunkType: model.ChunkTypeCode},
		{DocumentID: "d1", Score: 0.6, ChunkType: model.ChunkTypeText},
		{DocumentID: "d1", Score: 0.5, ChunkType: model.ChunkTypeText},
	}
	grouped := groupChunksByDoc(results, "")
	assert.Len(t, grouped, 2)
	assert.Len(t, grouped["d1"].chunks, 3, "max 3 chunks per doc")
	assert.Len(t, grouped["d2"].chunks, 1)
}

func TestGroupChunksByDoc_ExcludeID(t *testing.T) {
	results := []repo.ChunkSearchResult{
		{DocumentID: "d1", Score: 0.9},
		{DocumentID: "d2", Score: 0.8},
	}
	grouped := groupChunksByDoc(results, "d1")
	assert.Len(t, grouped, 1)
	_, ok := grouped["d1"]
	assert.False(t, ok)
}

func TestComputeWeightedScore_Empty(t *testing.T) {
	tw := map[model.ChunkType]float64{model.ChunkTypeText: 1.0}
	assert.Equal(t, float32(0), computeWeightedScore(nil, tw))
}

func TestComputeWeightedScore_SingleChunk(t *testing.T) {
	tw := map[model.ChunkType]float64{model.ChunkTypeText: 1.0}
	chunks := []repo.ChunkSearchResult{
		{Score: 0.5, ChunkType: model.ChunkTypeText},
	}
	score := computeWeightedScore(chunks, tw)
	assert.InDelta(t, 0.5, float64(score), 0.01)
}

func TestComputeWeightedScore_UnknownType(t *testing.T) {
	tw := map[model.ChunkType]float64{model.ChunkTypeText: 1.0}
	chunks := []repo.ChunkSearchResult{
		{Score: 0.5, ChunkType: "unknown"},
	}
	score := computeWeightedScore(chunks, tw)
	assert.Greater(t, score, float32(0))
}

func TestRankDocuments(t *testing.T) {
	tw := map[model.ChunkType]float64{model.ChunkTypeText: 1.0}
	_ = tw
	docMap := map[string]*docScoreGroup{
		"d1": {chunks: []repo.ChunkSearchResult{{Score: 0.9, ChunkType: model.ChunkTypeText}}},
		"d2": {chunks: []repo.ChunkSearchResult{{Score: 0.5, ChunkType: model.ChunkTypeText}}},
	}
	logger := noopLogger()
	ranked := rankDocuments(docMap, logger)
	assert.Len(t, ranked, 2)
}

// --- asset_service helpers ---

func TestExtractFileKeys(t *testing.T) {
	assert.Empty(t, extractFileKeys("no keys here"))

	content := `![img](/api/v1/files/abc123) and ![img2](/api/v1/files/def456)`
	keys := extractFileKeys(content)
	assert.Len(t, keys, 2)
	assert.Contains(t, keys, "abc123")
	assert.Contains(t, keys, "def456")
}

func TestExtractFileKeys_Dedup(t *testing.T) {
	content := `![img](/api/v1/files/abc) ![img](/api/v1/files/abc)`
	keys := extractFileKeys(content)
	assert.Len(t, keys, 1)
}

func TestExtractAssetURLs(t *testing.T) {
	assert.Empty(t, extractAssetURLs("no urls"))

	content := `link: https://example.com/a.jpg and http://other.com/b.png`
	urls := extractAssetURLs(content)
	assert.Len(t, urls, 2)
}

func TestExtractAssetURLs_Dedup(t *testing.T) {
	content := `https://a.com/x.jpg https://a.com/x.jpg`
	urls := extractAssetURLs(content)
	assert.Len(t, urls, 1)
}

func TestExtractAssetURLs_IgnoresNonAsset(t *testing.T) {
	content := `https://google.com https://github.com/foo`
	urls := extractAssetURLs(content)
	assert.Empty(t, urls)
}

// --- import_service helpers ---

func TestExtractHedgeDocTags(t *testing.T) {
	content := "# Title\n###### tags: `go` `rust`\nBody text"
	cleaned, tags := extractHedgeDocTags(content)
	assert.NotContains(t, cleaned, "tags:")
	assert.Contains(t, tags, "go")
	assert.Contains(t, tags, "rust")
}

func TestExtractHedgeDocTags_NoTags(t *testing.T) {
	content := "# Title\nBody text"
	cleaned, tags := extractHedgeDocTags(content)
	assert.Equal(t, content, cleaned)
	assert.Empty(t, tags)
}

func TestParseTagLine(t *testing.T) {
	assert.Equal(t, []string{"go", "rust"}, parseTagLine("`go` `rust`"))
	assert.Equal(t, []string{"a", "b"}, parseTagLine("a, b"))
	assert.Empty(t, parseTagLine(""))
}

func TestNormalizeTags(t *testing.T) {
	tags := normalizeTags([]string{"Go", "go", "Rust", " ", ""})
	assert.Equal(t, []string{"Go", "Rust"}, tags)
}

func TestUniqueTitle(t *testing.T) {
	counts := map[string]int{}
	assert.Equal(t, "test", uniqueTitle("test", counts))
	assert.Equal(t, "test (2)", uniqueTitle("test", counts))
	assert.Equal(t, "test (3)", uniqueTitle("test", counts))
	assert.Equal(t, "other", uniqueTitle("other", counts))
}

// --- template_service helpers ---

func TestNormalizeTemplateContentPlaceholders(t *testing.T) {
	input := "Hello {{ name }} and {{  sys:date  }}"
	result := normalizeTemplateContentPlaceholders(input)
	assert.Contains(t, result, "{{NAME}}")
	assert.Contains(t, result, "{{SYS:DATE}}")
}

func TestInferTemplateTitle(t *testing.T) {
	assert.Equal(t, "Hello", inferTemplateTitle("# Hello\nBody", ""))
	assert.Equal(t, "Hello", inferTemplateTitle("Hello\nBody", ""))
	assert.Equal(t, "fallback", inferTemplateTitle("", "fallback"))
	assert.Equal(t, "Untitled", inferTemplateTitle("", ""))
	assert.Equal(t, "Untitled", inferTemplateTitle("\n\n", ""))
}

func TestInferTemplateTitle_LongTitle(t *testing.T) {
	long := ""
	for i := 0; i < 100; i++ {
		long += "x"
	}
	result := inferTemplateTitle(long, "")
	assert.Len(t, []rune(result), 80)
}

func TestUniqueStringSlice(t *testing.T) {
	result := uniqueStringSlice([]string{"a", "b", "a", " ", "c", "b"})
	assert.Equal(t, []string{"a", "b", "c"}, result)
}

func TestUniqueStringSlice_Empty(t *testing.T) {
	assert.Empty(t, uniqueStringSlice(nil))
	assert.Empty(t, uniqueStringSlice([]string{}))
}

// --- ids.go ---

func TestNewID(t *testing.T) {
	id := newID()
	assert.Len(t, id, 32)
	id2 := newID()
	assert.NotEqual(t, id, id2)
}

func TestNewToken(t *testing.T) {
	tok := newToken()
	assert.Len(t, tok, 40)
	tok2 := newToken()
	assert.NotEqual(t, tok, tok2)
}

// --- resolveSystemVariable extra cases ---

func TestResolveSystemVariable_Now(t *testing.T) {
	now := time.Date(2026, 4, 28, 10, 30, 0, 0, time.UTC)
	assert.Equal(t, "2026-04-28 10:30", resolveSystemVariable("sys:now", now))
	assert.Equal(t, "2026-04-28 10:30", resolveSystemVariable("sys:datetime", now))
	assert.Equal(t, "", resolveSystemVariable("sys:unknown", now))
}

func TestApplyTemplateVariables_CustomValues(t *testing.T) {
	content := "Name: {{NAME}} Age: {{AGE}}"
	result := applyTemplateVariables(content, map[string]string{
		"NAME": "Alice",
		"AGE":  "30",
	})
	assert.Equal(t, "Name: Alice Age: 30", result)
}

func TestApplyTemplateVariables_UnknownVar(t *testing.T) {
	content := "Val: {{UNKNOWN}}"
	result := applyTemplateVariables(content, map[string]string{})
	assert.Equal(t, "Val: ", result)
}
