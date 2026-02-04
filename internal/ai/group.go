package ai

import (
	"context"
	"fmt"
	"strings"

	"github.com/xxxsen/common/logutil"
	"go.uber.org/zap"
)

type GeneratorEntry struct {
	Name      string
	Generator IGenerator
}

type EmbedderEntry struct {
	Name     string
	Embedder IEmbedder
}

type groupGenerator struct {
	items []GeneratorEntry
}

func NewGroupGenerator(items []GeneratorEntry) IGenerator {
	if len(items) == 0 {
		return nil
	}
	return &groupGenerator{items: items}
}

func (g *groupGenerator) Generate(ctx context.Context, prompt string) (string, error) {
	var lastErr error
	for i, item := range g.items {
		if item.Generator == nil {
			continue
		}
		res, err := item.Generator.Generate(ctx, prompt)
		if err == nil {
			return res, nil
		}
		lastErr = err
		logutil.GetLogger(ctx).Warn("generator failed", zap.Int("index", i), zap.String("name", item.Name), zap.Error(err))
	}
	if lastErr == nil {
		return "", fmt.Errorf("generator not configured")
	}
	return "", lastErr
}

type groupEmbedder struct {
	items []EmbedderEntry
}

func NewGroupEmbedder(items []EmbedderEntry) IEmbedder {
	if len(items) == 0 {
		return nil
	}
	return &groupEmbedder{items: items}
}

func (g *groupEmbedder) Embed(ctx context.Context, text string, taskType string) ([]float32, error) {
	var lastErr error
	for i, item := range g.items {
		if item.Embedder == nil {
			continue
		}
		res, err := item.Embedder.Embed(ctx, text, taskType)
		if err == nil {
			return res, nil
		}
		lastErr = err
		logutil.GetLogger(ctx).Warn("embedder failed", zap.Int("index", i), zap.String("name", item.Name), zap.Error(err))
	}
	if lastErr == nil {
		return nil, fmt.Errorf("embedder not configured")
	}
	return nil, lastErr
}

func (g *groupEmbedder) ModelName() string {
	names := make([]string, 0, len(g.items))
	for _, item := range g.items {
		if item.Name == "" {
			continue
		}
		names = append(names, item.Name)
	}
	if len(names) == 0 {
		return ""
	}
	return strings.Join(names, "|")
}
