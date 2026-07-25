package ai

import (
	"context"
	"strings"
	"unicode/utf8"

	"github.com/xxxsen/mnote/internal/model"
)

const (
	chunkerV2TargetUnits = 400
	chunkerV2HardUnits   = 512
	chunkerV2Overlap     = 60
	chunkerV2PrefixLimit = 320
)

type ChunkerV2 struct{}

func NewChunkerV2() *ChunkerV2 {
	return &ChunkerV2{}
}

type chunkV2Block struct {
	breadcrumb string
	chunkType  model.ChunkType
	content    string
	code       bool
}

type chunkV2Parser struct {
	headings  [3]string
	blocks    []chunkV2Block
	paragraph []string
	code      []string
	inCode    bool
	codeFence string
}

type chunkV2Builder struct {
	chunks     []model.ChunkEmbeddingV2
	position   int
	prefix     string
	body       string
	chunkType  model.ChunkType
	breadcrumb string
}

func (c *ChunkerV2) Chunk(
	_ context.Context,
	title, markdown string,
) ([]model.ChunkEmbeddingV2, error) {
	builder := &chunkV2Builder{}
	title = strings.TrimSpace(title)
	if title != "" {
		for _, content := range splitRunesByBytes("Title: "+title, chunkerV2TargetUnits) {
			builder.appendChunk(model.ChunkTypeTitle, content)
		}
	}
	for _, block := range parseChunkV2Blocks(markdown) {
		builder.addBlock(title, block)
	}
	builder.flush(false)
	return builder.chunks, nil
}

func (b *chunkV2Builder) addBlock(title string, block chunkV2Block) {
	content := strings.TrimSpace(block.content)
	if content == "" {
		return
	}
	prefix := chunkV2Prefix(title, block.breadcrumb)
	if b.breadcrumb != "" && b.breadcrumb != block.breadcrumb {
		b.flush(false)
	}
	if b.body != "" && b.prefix != prefix {
		b.flush(false)
	}
	b.prefix = prefix
	b.breadcrumb = block.breadcrumb
	bodyLimit := chunkerV2TargetUnits - len(prefix)
	if bodyLimit < 1 {
		bodyLimit = 1
	}
	var pieces []string
	if block.code {
		pieces = splitCodeByBytes(content, bodyLimit)
	} else {
		pieces = splitTextByBytes(content, bodyLimit)
	}
	for _, piece := range pieces {
		b.addPiece(piece, block.chunkType)
	}
}

func (b *chunkV2Builder) addPiece(piece string, chunkType model.ChunkType) {
	piece = strings.TrimSpace(piece)
	if piece == "" {
		return
	}
	separator := ""
	if b.body != "" {
		separator = "\n\n"
	}
	if len(b.prefix)+len(b.body)+len(separator)+len(piece) > chunkerV2TargetUnits {
		b.flush(true)
		separator = ""
		if b.body != "" {
			separator = "\n\n"
		}
		if len(b.prefix)+len(b.body)+len(separator)+len(piece) > chunkerV2TargetUnits {
			b.body = ""
			b.chunkType = ""
			separator = ""
		}
	}
	b.body += separator + piece
	b.chunkType = mergeChunkTypes(b.chunkType, chunkType)
}

func (b *chunkV2Builder) flush(preserveOverlap bool) {
	if strings.TrimSpace(b.body) == "" {
		b.body = ""
		b.chunkType = ""
		return
	}
	content := b.prefix + b.body
	if len(content) > chunkerV2HardUnits {
		for _, part := range splitRunesByBytes(content, chunkerV2HardUnits) {
			b.appendChunk(b.chunkType, part)
		}
	} else {
		b.appendChunk(b.chunkType, content)
	}
	overlap := ""
	overlapType := b.chunkType
	if preserveOverlap {
		overlap = tailRunesByBytes(b.body, chunkerV2Overlap)
		if len(b.prefix)+len(overlap) > chunkerV2TargetUnits {
			overlap = ""
		}
	}
	b.body = strings.TrimSpace(overlap)
	b.chunkType = ""
	if b.body != "" {
		b.chunkType = overlapType
	}
}

func (b *chunkV2Builder) appendChunk(chunkType model.ChunkType, content string) {
	content = strings.TrimSpace(content)
	if content == "" {
		return
	}
	b.chunks = append(b.chunks, model.ChunkEmbeddingV2{
		Position:   b.position,
		ChunkType:  chunkType,
		Content:    content,
		TokenCount: len([]byte(content)),
	})
	b.position++
}

func mergeChunkTypes(current, next model.ChunkType) model.ChunkType {
	if current == "" {
		return next
	}
	if current == next {
		return current
	}
	return model.ChunkTypeMixed
}

func chunkV2Prefix(title, breadcrumb string) string {
	title = truncateRunesByBytes(strings.TrimSpace(title), chunkerV2PrefixLimit/2)
	breadcrumb = truncateRunesByBytes(
		strings.TrimSpace(breadcrumb),
		chunkerV2PrefixLimit/2,
	)
	var lines []string
	if title != "" {
		lines = append(lines, "Title: "+title)
	}
	if breadcrumb != "" {
		lines = append(lines, "Section: "+breadcrumb)
	}
	if len(lines) == 0 {
		return ""
	}
	prefix := strings.Join(lines, "\n") + "\n\n"
	return truncateRunesByBytes(prefix, chunkerV2PrefixLimit)
}

func parseChunkV2Blocks(markdown string) []chunkV2Block {
	lines := strings.Split(strings.ReplaceAll(markdown, "\r\n", "\n"), "\n")
	parser := &chunkV2Parser{blocks: make([]chunkV2Block, 0)}
	for _, line := range lines {
		parser.consume(line)
	}
	parser.flushParagraph()
	if len(parser.code) > 0 {
		parser.flushCode()
	}
	return parser.blocks
}

func (parser *chunkV2Parser) consume(line string) {
	trimmed := strings.TrimSpace(line)
	if parser.inCode {
		parser.code = append(parser.code, line)
		if strings.HasPrefix(trimmed, parser.codeFence) {
			parser.inCode = false
			parser.flushCode()
		}
		return
	}
	if strings.HasPrefix(trimmed, "```") || strings.HasPrefix(trimmed, "~~~") {
		parser.flushParagraph()
		parser.inCode = true
		parser.codeFence = "~~~"
		if strings.HasPrefix(trimmed, "```") {
			parser.codeFence = "```"
		}
		parser.code = append(parser.code, line)
		return
	}
	if level, heading, ok := parseChunkV2Heading(trimmed); ok {
		parser.flushParagraph()
		parser.headings[level-1] = heading
		for index := level; index < len(parser.headings); index++ {
			parser.headings[index] = ""
		}
		return
	}
	if trimmed == "" {
		parser.flushParagraph()
		return
	}
	parser.paragraph = append(parser.paragraph, line)
}

func (parser *chunkV2Parser) breadcrumb() string {
	values := make([]string, 0, len(parser.headings))
	for _, heading := range parser.headings {
		if heading != "" {
			values = append(values, heading)
		}
	}
	return strings.Join(values, " > ")
}

func (parser *chunkV2Parser) flushParagraph() {
	content := strings.TrimSpace(strings.Join(parser.paragraph, "\n"))
	if content != "" {
		parser.blocks = append(parser.blocks, chunkV2Block{
			breadcrumb: parser.breadcrumb(),
			chunkType:  model.ChunkTypeText,
			content:    content,
		})
	}
	parser.paragraph = nil
}

func (parser *chunkV2Parser) flushCode() {
	content := strings.TrimSpace(strings.Join(parser.code, "\n"))
	if content != "" {
		parser.blocks = append(parser.blocks, chunkV2Block{
			breadcrumb: parser.breadcrumb(),
			chunkType:  model.ChunkTypeCode,
			content:    content,
			code:       true,
		})
	}
	parser.code = nil
}

func parseChunkV2Heading(line string) (int, string, bool) {
	for level := 3; level >= 1; level-- {
		prefix := strings.Repeat("#", level) + " "
		if strings.HasPrefix(line, prefix) {
			heading := strings.TrimSpace(strings.TrimRight(
				strings.TrimSpace(strings.TrimPrefix(line, prefix)),
				"#",
			))
			if heading != "" {
				return level, heading, true
			}
		}
	}
	return 0, "", false
}

func splitTextByBytes(value string, limit int) []string {
	if len(value) <= limit {
		return []string{value}
	}
	sentences := splitSentences(value)
	if len(sentences) > 1 {
		return packOrSplit(sentences, limit, splitLinesByBytes)
	}
	return splitLinesByBytes(value, limit)
}

func splitCodeByBytes(value string, limit int) []string {
	return splitLinesByBytes(value, limit)
}

func splitLinesByBytes(value string, limit int) []string {
	if len(value) <= limit {
		return []string{value}
	}
	lines := strings.Split(value, "\n")
	return packOrSplit(lines, limit, splitRunesByBytes)
}

func packOrSplit(
	values []string,
	limit int,
	fallback func(string, int) []string,
) []string {
	result := make([]string, 0, len(values))
	current := ""
	flush := func() {
		if strings.TrimSpace(current) != "" {
			result = append(result, current)
		}
		current = ""
	}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if len(value) > limit {
			flush()
			result = append(result, fallback(value, limit)...)
			continue
		}
		separator := ""
		if current != "" {
			separator = "\n"
		}
		if len(current)+len(separator)+len(value) > limit {
			flush()
			separator = ""
		}
		current += separator + value
	}
	flush()
	return result
}

func splitSentences(value string) []string {
	var result []string
	start := 0
	for offset, char := range value {
		if char != '.' && char != '?' && char != '!' &&
			char != '。' && char != '？' && char != '！' {
			continue
		}
		end := offset + utf8.RuneLen(char)
		result = append(result, strings.TrimSpace(value[start:end]))
		start = end
	}
	if tail := strings.TrimSpace(value[start:]); tail != "" {
		result = append(result, tail)
	}
	return result
}

func splitRunesByBytes(value string, limit int) []string {
	if limit <= 0 {
		limit = 1
	}
	if len(value) <= limit {
		return []string{value}
	}
	result := make([]string, 0, len(value)/limit+1)
	start := 0
	currentBytes := 0
	for offset, char := range value {
		size := utf8.RuneLen(char)
		if currentBytes > 0 && currentBytes+size > limit {
			result = append(result, value[start:offset])
			start = offset
			currentBytes = 0
		}
		currentBytes += size
	}
	if start < len(value) {
		result = append(result, value[start:])
	}
	return result
}

func truncateRunesByBytes(value string, limit int) string {
	parts := splitRunesByBytes(value, limit)
	if len(parts) == 0 {
		return ""
	}
	return parts[0]
}

func tailRunesByBytes(value string, limit int) string {
	value = strings.TrimSpace(value)
	if len(value) <= limit {
		return value
	}
	start := len(value) - limit
	for start < len(value) && !utf8.RuneStart(value[start]) {
		start++
	}
	return strings.TrimSpace(value[start:])
}
