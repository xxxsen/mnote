package ai

import (
	"context"
	"fmt"
	"strings"

	"github.com/xxxsen/common/logutil"
	"github.com/xxxsen/mnote/internal/model"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/text"
	"go.uber.org/zap"
)

type Chunker struct {
	gen IGenerator
}

func NewChunker(gen IGenerator) *Chunker {
	return &Chunker{gen: gen}
}

func (c *Chunker) Chunk(ctx context.Context, markdown string) ([]*model.ChunkEmbedding, error) {
	logger := logutil.GetLogger(ctx)
	md := goldmark.New()
	reader := text.NewReader([]byte(markdown))
	doc := md.Parser().Parse(reader)

	var chunks []*model.ChunkEmbedding
	var currentChunk []string
	var currentTokens int
	var currentType model.ChunkType = model.ChunkTypeText
	var currentHeading string
	var currentLang string = "null"
	position := 0

	flush := func() {
		if len(currentChunk) == 0 {
			return
		}
		content := strings.Join(currentChunk, "\n\n")
		// Heading context is important for all chunks
		if currentHeading != "" {
			content = "Heading: " + currentHeading + "\n" + content
		}

		finalContent := fmt.Sprintf("[chunk_type=%s]\n[language=%s]\n%s", currentType, currentLang, content)
		tokenCount := estimateTokens(finalContent)

		logger.Debug("flushing chunk",
			zap.Int("position", position),
			zap.String("type", string(currentType)),
			zap.String("lang", currentLang),
			zap.Int("tokens", tokenCount),
		)

		chunks = append(chunks, &model.ChunkEmbedding{
			Content:    finalContent,
			TokenCount: tokenCount,
			ChunkType:  currentType,
			Position:   position,
		})

		if currentType == model.ChunkTypeText && len(currentChunk) > 1 {
			overlapTokens := 0
			var overlapParts []string
			for i := len(currentChunk) - 1; i >= 0; i-- {
				t := estimateTokens(currentChunk[i])
				if overlapTokens+t > 80 {
					break
				}
				overlapTokens += t
				overlapParts = append([]string{currentChunk[i]}, overlapParts...)
			}
			logger.Debug("overlap preserved", zap.Int("parts", len(overlapParts)), zap.Int("tokens", overlapTokens))
			currentChunk = overlapParts
			currentTokens = overlapTokens
		} else {
			currentChunk = nil
			currentTokens = 0
		}
		currentType = model.ChunkTypeText
		currentLang = "null"
		position++
	}

	logger.Info("starting markdown chunking", zap.Int("size", len(markdown)))

	for node := doc.FirstChild(); node != nil; node = node.NextSibling() {
		switch n := node.(type) {
		case *ast.Heading:
			if n.Level == 1 || n.Level == 2 {
				heading := string(n.Text(reader.Source()))
				logger.Debug("new heading detected, flushing", zap.Int("level", n.Level), zap.String("heading", heading))
				flush()
				currentHeading = heading
			} else {
				txt := string(n.Text(reader.Source()))
				currentChunk = append(currentChunk, txt)
				currentTokens += estimateTokens(txt)
			}
		case *ast.FencedCodeBlock:
			lang := string(n.Language(reader.Source()))
			if lang == "" {
				lang = "null"
			}
			code := ""
			for i := 0; i < n.Lines().Len(); i++ {
				line := n.Lines().At(i)
				code += string(line.Value(reader.Source()))
			}
			tokens := estimateTokens(code)
			logger.Debug("code block detected", zap.String("lang", lang), zap.Int("tokens", tokens))
			if tokens > 300 {
				logger.Info("long code block, generating summary", zap.Int("tokens", tokens))
				summary, err := c.summarizeCode(ctx, code)
				if err == nil {
					flush()
					chunks = append(chunks, &model.ChunkEmbedding{
						Content:    fmt.Sprintf("[chunk_type=code]\n[language=%s]\n[code_summary]\n%s", lang, summary),
						TokenCount: estimateTokens(summary),
						ChunkType:  model.ChunkTypeCode,
						Position:   position,
					})
					position++
					continue
				}
				logger.Warn("failed to summarize code block, falling back to original code", zap.Error(err))
			}

			// Try to merge with previous text if it's small
			if currentTokens > 0 && currentTokens+tokens <= 400 {
				currentChunk = append(currentChunk, "```"+lang+"\n"+code+"\n```")
				currentTokens += tokens
				currentType = model.ChunkTypeMixed
				currentLang = lang
			} else {
				flush()
				currentChunk = append(currentChunk, "```"+lang+"\n"+code+"\n```")
				currentTokens = tokens
				currentType = model.ChunkTypeCode
				currentLang = lang
				flush()
			}

		default:
			txt := extractText(n, reader.Source())
			if txt == "" {
				continue
			}
			tokens := estimateTokens(txt)
			if currentTokens+tokens > 400 {
				flush()
			}
			currentChunk = append(currentChunk, txt)
			currentTokens += tokens
		}
	}
	flush()
	logger.Info("chunking completed", zap.Int("total_chunks", len(chunks)))
	return chunks, nil
}

func (c *Chunker) summarizeCode(ctx context.Context, code string) (string, error) {
	if c.gen == nil {
		return "", fmt.Errorf("no generator for code summary")
	}
	prompt := fmt.Sprintf("Summarize the following code block in 1-2 sentences. Focus on its purpose and key logic.\n\nCODE:\n%s", code)
	return c.gen.Generate(ctx, prompt)
}

func estimateTokens(text string) int {
	// Simple heuristic: 1 token per 4 characters for English, 1 per character for CJK
	// We'll use a slightly safer one: count words for English, characters for CJK
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

func extractText(n ast.Node, source []byte) string {
	var sb strings.Builder
	ast.Walk(n, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if !entering {
			return ast.WalkContinue, nil
		}
		if node.Type() == ast.TypeBlock || node.Type() == ast.TypeInline {
			if node.Kind() == ast.KindText {
				sb.Write(node.(*ast.Text).Segment.Value(source))
			}
		}
		return ast.WalkContinue, nil
	})
	return strings.TrimSpace(sb.String())
}
