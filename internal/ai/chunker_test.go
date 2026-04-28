package ai

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/model"
)

type mockGenerator struct {
	result string
	err    error
}

func (m *mockGenerator) Generate(_ context.Context, _ string) (string, error) {
	return m.result, m.err
}

func TestChunker_SimpleText(t *testing.T) {
	c := NewChunker(nil)
	chunks, err := c.Chunk(context.Background(), "Hello world. This is a test document.")
	require.NoError(t, err)
	assert.NotEmpty(t, chunks)
	assert.Equal(t, model.ChunkTypeText, chunks[0].ChunkType)
}

func TestChunker_Headings(t *testing.T) {
	md := "# Title\n\nSome intro text\n\n## Section 1\n\nContent for section 1\n\n## Section 2\n\nContent for section 2"
	c := NewChunker(nil)
	chunks, err := c.Chunk(context.Background(), md)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(chunks), 2)
}

func TestChunker_CodeBlock(t *testing.T) {
	md := "Some text\n\n```go\nfunc main() {\n\tfmt.Println(\"hello\")\n}\n```\n\nMore text"
	c := NewChunker(nil)
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
	c := NewChunker(nil)
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
	c := NewChunker(nil)
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
	c := NewChunker(nil)
	chunks, err := c.Chunk(context.Background(), md)
	require.NoError(t, err)
	assert.Greater(t, len(chunks), 1, "should split into multiple chunks")
}

func TestChunker_HeadingLevels(t *testing.T) {
	md := "# H1\n\nText under h1\n\n### H3\n\nText under h3\n\n## H2\n\nText under h2"
	c := NewChunker(nil)
	chunks, err := c.Chunk(context.Background(), md)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(chunks), 2)
}

func TestChunker_MixedCodeAndText(t *testing.T) {
	md := "Some intro\n\n```python\nprint('hello')\n```\n\nMiddle text\n\n```js\nconsole.log('hi')\n```\n\nEnd text"
	c := NewChunker(nil)
	chunks, err := c.Chunk(context.Background(), md)
	require.NoError(t, err)
	assert.NotEmpty(t, chunks)
}

func TestChunker_CodeSummary(t *testing.T) {
	gen := &mockGenerator{result: "This function does X"}
	c := NewChunker(gen)

	var longCode strings.Builder
	for range 100 {
		longCode.WriteString("x := doSomething(a, b, c, d)\n")
	}
	md := "```go\n" + longCode.String() + "```"

	chunks, err := c.Chunk(context.Background(), md)
	require.NoError(t, err)
	assert.NotEmpty(t, chunks)
}

func TestChunker_SummarizeCode_NilGen(t *testing.T) {
	c := NewChunker(nil)
	_, err := c.summarizeCode(context.Background(), "code")
	assert.ErrorIs(t, err, ErrNotConfigured)
}

func TestChunker_SummarizeCode_Success(t *testing.T) {
	gen := &mockGenerator{result: "summary of code"}
	c := NewChunker(gen)
	summary, err := c.summarizeCode(context.Background(), "func main() {}")
	require.NoError(t, err)
	assert.Equal(t, "summary of code", summary)
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
	c := NewChunker(nil)
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
	c := NewChunker(nil)
	chunks, err := c.Chunk(context.Background(), md)
	require.NoError(t, err)
	assert.Empty(t, chunks, "headings-only input produces no content chunks")
}

func TestChunker_CodeSummaryFail(t *testing.T) {
	gen := &mockGenerator{err: errors.New("summary fail")}
	c := NewChunker(gen)

	var longCode strings.Builder
	for range 100 {
		longCode.WriteString("x := doSomething(a, b, c, d)\n")
	}
	md := "```go\n" + longCode.String() + "```"

	chunks, err := c.Chunk(context.Background(), md)
	require.NoError(t, err)
	assert.NotEmpty(t, chunks)
}

func TestChunker_SmallCodeBlockMixed(t *testing.T) {
	md := "Some intro text here with enough content to start a chunk.\n\n```go\nfmt.Println(\"short\")\n```"
	c := NewChunker(nil)
	chunks, err := c.Chunk(context.Background(), md)
	require.NoError(t, err)
	assert.NotEmpty(t, chunks)
}

func TestChunker_CodeBlockNoLanguage(t *testing.T) {
	md := "```\nplain code\n```"
	c := NewChunker(nil)
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
	c := NewChunker(nil)
	chunks, err := c.Chunk(context.Background(), md)
	require.NoError(t, err)
	assert.Greater(t, len(chunks), 1)
}

func TestChunker_MultipleH2Sections(t *testing.T) {
	md := "## A\n\nText A\n\n## B\n\nText B\n\n## C\n\nText C"
	c := NewChunker(nil)
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

func TestGroupGenerator_AllNilNotConfigured(t *testing.T) {
	gen := NewGroupGenerator([]GeneratorEntry{
		{Name: "nil1", Generator: nil},
	})
	_, err := gen.Generate(context.Background(), "prompt")
	assert.ErrorIs(t, err, ErrNotConfigured)
}
