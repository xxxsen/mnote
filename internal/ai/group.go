package ai

import (
	"context"
	"strings"

	"github.com/xxxsen/common/logutil"
	"go.uber.org/zap"
)

type EmbedderEntry struct {
	Name     string
	Embedder IEmbedder
}

type groupEmbedder struct {
	items []EmbedderEntry
}

func NewGroupEmbedder(items []EmbedderEntry) IEmbedder {
	return &groupEmbedder{items: items}
}

func (g *groupEmbedder) Embed(
	ctx context.Context, text, taskType string,
) ([]float32, error) {
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
		logutil.GetLogger(ctx).Warn(
			"embedder failed",
			zap.Int("index", i),
			zap.String("name", item.Name),
			zap.Error(err),
		)
	}
	if lastErr == nil {
		return nil, ErrNotConfigured
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
