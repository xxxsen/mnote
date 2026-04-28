package ai

import (
	"context"
	"fmt"
	"strings"

	"github.com/xxxsen/common/logutil"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/text"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/model"
)

type Chunker struct {
	gen IGenerator
}

func NewChunker(gen IGenerator) *Chunker {
	return &Chunker{gen: gen}
}

type chunkState struct {
	chunks         []*model.ChunkEmbedding
	currentChunk   []string
	currentTokens  int
	currentType    model.ChunkType
	currentHeading string
	currentLang    string
	position       int
}

func newChunkState() *chunkState {
	return &chunkState{
		currentType: model.ChunkTypeText,
		currentLang: "null",
	}
}

func (s *chunkState) flush(logger *zap.Logger) {
	if len(s.currentChunk) == 0 {
		return
	}
	content := strings.Join(s.currentChunk, "\n\n")
	if s.currentHeading != "" {
		content = "Heading: " + s.currentHeading + "\n" + content
	}

	finalContent := fmt.Sprintf(
		"[chunk_type=%s]\n[language=%s]\n%s",
		s.currentType, s.currentLang, content,
	)
	tokenCount := estimateTokens(finalContent)

	logger.Debug("flushing chunk",
		zap.Int("position", s.position),
		zap.String("type", string(s.currentType)),
		zap.String("lang", s.currentLang),
		zap.Int("tokens", tokenCount),
	)

	s.chunks = append(s.chunks, &model.ChunkEmbedding{
		Content:    finalContent,
		TokenCount: tokenCount,
		ChunkType:  s.currentType,
		Position:   s.position,
	})

	s.preserveOverlap(logger)
}

func (s *chunkState) preserveOverlap(logger *zap.Logger) {
	if s.currentType == model.ChunkTypeText && len(s.currentChunk) > 1 {
		overlapTokens := 0
		var overlapParts []string
		for i := len(s.currentChunk) - 1; i >= 0; i-- {
			t := estimateTokens(s.currentChunk[i])
			if overlapTokens+t > 80 {
				break
			}
			overlapTokens += t
			overlapParts = append([]string{s.currentChunk[i]}, overlapParts...)
		}
		logger.Debug("overlap preserved",
			zap.Int("parts", len(overlapParts)),
			zap.Int("tokens", overlapTokens),
		)
		s.currentChunk = overlapParts
		s.currentTokens = overlapTokens
	} else {
		s.currentChunk = nil
		s.currentTokens = 0
	}
	s.currentType = model.ChunkTypeText
	s.currentLang = "null"
	s.position++
}

func (c *Chunker) Chunk(
	ctx context.Context, markdown string,
) ([]*model.ChunkEmbedding, error) {
	logger := logutil.GetLogger(ctx)
	md := goldmark.New()
	source := []byte(markdown)
	reader := text.NewReader(source)
	doc := md.Parser().Parse(reader)
	state := newChunkState()

	logger.Info("starting markdown chunking", zap.Int("size", len(markdown)))

	for node := doc.FirstChild(); node != nil; node = node.NextSibling() {
		if err := c.processNode(ctx, node, source, state, logger); err != nil {
			return nil, err
		}
	}
	state.flush(logger)
	logger.Info("chunking completed", zap.Int("total_chunks", len(state.chunks)))
	return state.chunks, nil
}

func (c *Chunker) processNode(
	ctx context.Context,
	node ast.Node,
	source []byte,
	state *chunkState,
	logger *zap.Logger,
) error {
	switch n := node.(type) {
	case *ast.Heading:
		return c.processHeading(n, source, state, logger)
	case *ast.FencedCodeBlock:
		return c.processCodeBlock(ctx, n, source, state, logger)
	default:
		return c.processTextBlock(n, source, state, logger)
	}
}

func (c *Chunker) processHeading(
	n *ast.Heading,
	source []byte,
	state *chunkState,
	logger *zap.Logger,
) error {
	headingText, err := extractText(n, source)
	if err != nil {
		return err
	}
	if n.Level <= 2 {
		logger.Debug("new heading detected, flushing",
			zap.Int("level", n.Level),
			zap.String("heading", headingText),
		)
		state.flush(logger)
		state.currentHeading = headingText
	} else {
		state.currentChunk = append(state.currentChunk, headingText)
		state.currentTokens += estimateTokens(headingText)
	}
	return nil
}

func (c *Chunker) processCodeBlock(
	ctx context.Context,
	n *ast.FencedCodeBlock,
	source []byte,
	state *chunkState,
	logger *zap.Logger,
) error {
	lang := string(n.Language(source))
	if lang == "" {
		lang = "null"
	}
	code := extractCodeLines(n, source)
	tokens := estimateTokens(code)
	logger.Debug("code block detected",
		zap.String("lang", lang), zap.Int("tokens", tokens),
	)

	if tokens > 300 {
		if handled := c.tryCodeSummary(ctx, code, lang, tokens, state, logger); handled {
			return nil
		}
	}

	if state.currentTokens > 0 && state.currentTokens+tokens <= 400 {
		state.currentChunk = append(state.currentChunk, "```"+lang+"\n"+code+"\n```")
		state.currentTokens += tokens
		state.currentType = model.ChunkTypeMixed
		state.currentLang = lang
	} else {
		state.flush(logger)
		state.currentChunk = append(state.currentChunk, "```"+lang+"\n"+code+"\n```")
		state.currentTokens = tokens
		state.currentType = model.ChunkTypeCode
		state.currentLang = lang
		state.flush(logger)
	}
	return nil
}

func (c *Chunker) tryCodeSummary(
	ctx context.Context,
	code, lang string,
	tokens int,
	state *chunkState,
	logger *zap.Logger,
) bool {
	logger.Info("long code block, generating summary", zap.Int("tokens", tokens))
	summary, err := c.summarizeCode(ctx, code)
	if err != nil {
		logger.Warn("failed to summarize code block", zap.Error(err))
		return false
	}
	state.flush(logger)
	state.chunks = append(state.chunks, &model.ChunkEmbedding{
		Content: fmt.Sprintf(
			"[chunk_type=code]\n[language=%s]\n[code_summary]\n%s",
			lang, summary,
		),
		TokenCount: estimateTokens(summary),
		ChunkType:  model.ChunkTypeCode,
		Position:   state.position,
	})
	state.position++
	return true
}

func (*Chunker) processTextBlock(
	n ast.Node,
	source []byte,
	state *chunkState,
	logger *zap.Logger,
) error {
	txt, err := extractText(n, source)
	if err != nil {
		return err
	}
	if txt == "" {
		return nil
	}
	tokens := estimateTokens(txt)
	if state.currentTokens+tokens > 400 {
		state.flush(logger)
	}
	state.currentChunk = append(state.currentChunk, txt)
	state.currentTokens += tokens
	return nil
}

func extractCodeLines(n *ast.FencedCodeBlock, source []byte) string {
	var code string
	for i := 0; i < n.Lines().Len(); i++ {
		line := n.Lines().At(i)
		code += string(line.Value(source))
	}
	return code
}

func (c *Chunker) summarizeCode(
	ctx context.Context, code string,
) (string, error) {
	if c.gen == nil {
		return "", ErrNotConfigured
	}
	prompt := "Summarize the following code block in 1-2 sentences. " +
		"Focus on its purpose and key logic.\n\nCODE:\n" + code
	res, err := c.gen.Generate(ctx, prompt)
	if err != nil {
		return "", fmt.Errorf("summarize code: %w", err)
	}
	return res, nil
}

func estimateTokens(text string) int {
	count := 0
	for _, r := range text {
		if r > 127 {
			count++
		}
	}
	words := strings.Fields(text)
	count += len(words)
	if count == 0 && len(text) > 0 {
		return 1
	}
	return count
}

func extractText(n ast.Node, source []byte) (string, error) {
	buf := make([]byte, 0, 256)
	if err := ast.Walk(n, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		if (node.Type() == ast.TypeBlock || node.Type() == ast.TypeInline) &&
			node.Kind() == ast.KindText {
			textNode, ok := node.(*ast.Text)
			if ok {
				buf = append(buf, textNode.Segment.Value(source)...)
			}
		}
		return ast.WalkContinue, nil
	}); err != nil {
		return "", fmt.Errorf("walk ast: %w", err)
	}
	return strings.TrimSpace(string(buf)), nil
}
