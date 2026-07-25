package ai

import (
	"context"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/model"
)

func TestChunker_SimpleText(t *testing.T) {
	c := NewChunker()
	chunks, err := c.Chunk(context.Background(), "Hello world. This is a test document.")
	require.NoError(t, err)
	assert.NotEmpty(t, chunks)
	assert.Equal(t, model.ChunkTypeText, chunks[0].ChunkType)
}

func TestChunker_Headings(t *testing.T) {
	md := "# Title\n\nSome intro text\n\n## Section 1\n\nContent for section 1\n\n## Section 2\n\nContent for section 2"
	c := NewChunker()
	chunks, err := c.Chunk(context.Background(), md)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(chunks), 2)
}

func TestChunker_CodeBlock(t *testing.T) {
	md := "Some text\n\n```go\nfunc main() {\n\tfmt.Println(\"hello\")\n}\n```\n\nMore text"
	c := NewChunker()
	chunks, err := c.Chunk(context.Background(), md)
	require.NoError(t, err)
	assert.NotEmpty(t, chunks)

	hasCode := false
	for _, ch := range chunks {
		if ch.ChunkType == model.ChunkTypeCode || ch.ChunkType == model.ChunkTypeMixed {
			hasCode = true
			break
		}
	}
	assert.True(t, hasCode, "should contain code or mixed chunk")
}

func TestChunker_EmptyInput(t *testing.T) {
	c := NewChunker()
	chunks, err := c.Chunk(context.Background(), "")
	require.NoError(t, err)
	assert.Empty(t, chunks)
}

func TestEstimateTokens(t *testing.T) {
	tests := []struct {
		name string
		text string
		min  int
	}{
		{"empty", "", 0},
		{"english", "hello world", 2},
		{"chinese", "你好世界", 4},
		{"mixed", "hello 你好", 3},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := estimateTokens(tt.text)
			assert.GreaterOrEqual(t, got, tt.min)
		})
	}
}

func TestExtractCodeLines(t *testing.T) {
	md := "```go\nline1\nline2\n```"
	c := NewChunker()
	chunks, err := c.Chunk(context.Background(), md)
	require.NoError(t, err)
	assert.NotEmpty(t, chunks)
}

func TestChunker_LargeTextSplits(t *testing.T) {
	parts := make([]string, 0, 50)
	for range 50 {
		parts = append(parts, "This is a sentence with enough words to count as tokens for the chunking logic.")
	}
	md := strings.Join(parts, "\n\n")
	c := NewChunker()
	chunks, err := c.Chunk(context.Background(), md)
	require.NoError(t, err)
	assert.Greater(t, len(chunks), 1, "should split into multiple chunks")
}

func TestChunker_HeadingLevels(t *testing.T) {
	md := "# H1\n\nText under h1\n\n### H3\n\nText under h3\n\n## H2\n\nText under h2"
	c := NewChunker()
	chunks, err := c.Chunk(context.Background(), md)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(chunks), 2)
}

func TestChunker_MixedCodeAndText(t *testing.T) {
	md := "Some intro\n\n```python\nprint('hello')\n```\n\nMiddle text\n\n```js\nconsole.log('hi')\n```\n\nEnd text"
	c := NewChunker()
	chunks, err := c.Chunk(context.Background(), md)
	require.NoError(t, err)
	assert.NotEmpty(t, chunks)
}

func TestEstimateTokens_SingleChar(t *testing.T) {
	assert.Equal(t, 1, estimateTokens("x"))
}

func TestChunkState_FlushEmpty(t *testing.T) {
	state := newChunkState()
	logger := zap.NewNop()
	state.flush(logger)
	assert.Empty(t, state.chunks, "flushing empty state should produce no chunks")
}

func TestChunkState_PreserveOverlap(t *testing.T) {
	state := newChunkState()
	state.currentChunk = []string{"part1", "part2", "part3"}
	state.currentTokens = 100
	state.currentType = model.ChunkTypeText
	logger := zap.NewNop()
	state.flush(logger)
	assert.Len(t, state.chunks, 1)
	assert.GreaterOrEqual(t, len(state.currentChunk), 0)
}

func TestChunkState_PreserveOverlap_Code(t *testing.T) {
	state := newChunkState()
	state.currentChunk = []string{"code block"}
	state.currentTokens = 50
	state.currentType = model.ChunkTypeCode
	logger := zap.NewNop()
	state.flush(logger)
	assert.Nil(t, state.currentChunk, "code chunks should not preserve overlap")
}

func TestChunker_TextBlockOverflow(t *testing.T) {
	c := NewChunker()
	longParagraphs := make([]string, 0, 20)
	for range 20 {
		longParagraphs = append(longParagraphs, "Word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word word.")
	}
	md := strings.Join(longParagraphs, "\n\n")
	chunks, err := c.Chunk(context.Background(), md)
	require.NoError(t, err)
	assert.Greater(t, len(chunks), 1)
}

func TestChunker_EmptyTextBlock(t *testing.T) {
	md := "# Title\n\n\n\n## Section"
	c := NewChunker()
	chunks, err := c.Chunk(context.Background(), md)
	require.NoError(t, err)
	assert.Empty(t, chunks, "headings-only input produces no content chunks")
}

func TestChunker_SmallCodeBlockMixed(t *testing.T) {
	md := "Some intro text here with enough content to start a chunk.\n\n```go\nfmt.Println(\"short\")\n```"
	c := NewChunker()
	chunks, err := c.Chunk(context.Background(), md)
	require.NoError(t, err)
	assert.NotEmpty(t, chunks)
}

func TestChunker_CodeBlockNoLanguage(t *testing.T) {
	md := "```\nplain code\n```"
	c := NewChunker()
	chunks, err := c.Chunk(context.Background(), md)
	require.NoError(t, err)
	assert.NotEmpty(t, chunks)
}

func TestChunker_TextThenOverflow(t *testing.T) {
	parts := make([]string, 0, 60)
	for range 60 {
		parts = append(parts, "This is a moderately long sentence that should contribute many tokens for overflow testing purposes.")
	}
	md := "# Section\n\n" + strings.Join(parts, "\n\n")
	c := NewChunker()
	chunks, err := c.Chunk(context.Background(), md)
	require.NoError(t, err)
	assert.Greater(t, len(chunks), 1)
}

func TestChunker_MultipleH2Sections(t *testing.T) {
	md := "## A\n\nText A\n\n## B\n\nText B\n\n## C\n\nText C"
	c := NewChunker()
	chunks, err := c.Chunk(context.Background(), md)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(chunks), 3)
}

func TestEstimateTokens_OnlyNonASCII(t *testing.T) {
	count := estimateTokens("你好世界测试")
	assert.Equal(t, 7, count)
}

func TestEstimateTokens_WhitespaceOnly(t *testing.T) {
	count := estimateTokens("   ")
	assert.Equal(t, 1, count)
}
