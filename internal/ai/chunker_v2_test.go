package ai

import (
	"context"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
)

func TestChunkerV2_TitleBreadcrumbAndStablePositions(t *testing.T) {
	input := "# Chapter\n\nParagraph one.\n\n## Detail\n\nParagraph two.\n\n```go\nfmt.Println(\"x\")\n```"
	chunker := NewChunkerV2()
	first, err := chunker.Chunk(context.Background(), "Document", input)
	require.NoError(t, err)
	second, err := chunker.Chunk(context.Background(), "Document", input)
	require.NoError(t, err)
	assert.Equal(t, first, second)
	require.NotEmpty(t, first)
	assert.Equal(t, model.ChunkTypeTitle, first[0].ChunkType)
	assert.Equal(t, "Title: Document", first[0].Content)
	for position, chunk := range first {
		assert.Equal(t, position, chunk.Position)
		assert.LessOrEqual(t, len([]byte(chunk.Content)), chunkerV2HardUnits)
		assert.Equal(t, len([]byte(chunk.Content)), chunk.TokenCount)
		assert.True(t, utf8.ValidString(chunk.Content))
	}
	assert.Contains(t, first[1].Content, "Section: Chapter")
	assert.Contains(t, first[len(first)-1].Content, "Chapter > Detail")
}

func TestChunkerV2_HardLimitForLongTextCodeAndUnicode(t *testing.T) {
	input := strings.Repeat("超长句子没有标点", 180) +
		"\n\n```text\n" + strings.Repeat("x", 1400) + "\n```"
	chunks, err := NewChunkerV2().Chunk(
		context.Background(),
		strings.Repeat("标题", 300),
		input,
	)
	require.NoError(t, err)
	require.Greater(t, len(chunks), 5)
	for _, chunk := range chunks {
		assert.NotEmpty(t, chunk.Content)
		assert.LessOrEqual(t, len([]byte(chunk.Content)), chunkerV2HardUnits)
		assert.True(t, utf8.ValidString(chunk.Content))
	}
}

func TestChunkerV2_EmptyAndTitleOnly(t *testing.T) {
	chunker := NewChunkerV2()
	empty, err := chunker.Chunk(context.Background(), "", "")
	require.NoError(t, err)
	assert.Empty(t, empty)

	titleOnly, err := chunker.Chunk(context.Background(), "Only title", " \n")
	require.NoError(t, err)
	require.Len(t, titleOnly, 1)
	assert.Equal(t, model.ChunkTypeTitle, titleOnly[0].ChunkType)
}

func TestChunkerV2_OverlapDoesNotCrossSection(t *testing.T) {
	firstSection := strings.Repeat("alpha ", 150)
	secondSection := strings.Repeat("beta ", 80)
	chunks, err := NewChunkerV2().Chunk(
		context.Background(),
		"Doc",
		"# First\n"+firstSection+"\n# Second\n"+secondSection,
	)
	require.NoError(t, err)
	for _, chunk := range chunks {
		if strings.Contains(chunk.Content, "Section: Second") {
			assert.NotContains(t, chunk.Content, "alpha")
		}
	}
}

func TestChunkerV2_CommonMarkdownStructuresAndMultilingualText(t *testing.T) {
	markdown := `# Overview

- first item
- 第二项

> quoted text

[reference](https://example.com)

| name | value |
| --- | --- |
| alpha | 中文内容 |

English text 与中文内容 mixed together.`
	chunks, err := NewChunkerV2().Chunk(
		context.Background(),
		"Markdown structures",
		markdown,
	)
	require.NoError(t, err)
	require.NotEmpty(t, chunks)
	var combined strings.Builder
	for _, chunk := range chunks {
		combined.WriteString(chunk.Content)
		combined.WriteByte('\n')
		assert.LessOrEqual(t, len([]byte(chunk.Content)), chunkerV2HardUnits)
		assert.True(t, utf8.ValidString(chunk.Content))
	}
	for _, expected := range []string{
		"Overview",
		"first item",
		"第二项",
		"quoted text",
		"https://example.com",
		"| alpha | 中文内容 |",
		"English text 与中文内容",
	} {
		assert.Contains(t, combined.String(), expected)
	}
}

func TestChunkerV2_TitleChangeChangesTitleAndBodyChunks(t *testing.T) {
	chunker := NewChunkerV2()
	first, err := chunker.Chunk(context.Background(), "First title", "same body")
	require.NoError(t, err)
	second, err := chunker.Chunk(context.Background(), "Second title", "same body")
	require.NoError(t, err)
	require.Len(t, first, 2)
	require.Len(t, second, 2)
	assert.NotEqual(t, first[0].Content, second[0].Content)
	assert.NotEqual(t, first[1].Content, second[1].Content)
}
