package embedcache

import (
	"context"
	"time"

	"github.com/hashicorp/golang-lru/v2/expirable"
	"github.com/xxxsen/common/logutil"
	"github.com/xxxsen/mnote/internal/ai"
	"go.uber.org/zap"
)

func WrapLruCacheToEmbedder(e ai.IEmbedder, size int, ttl time.Duration) ai.IEmbedder {
	if e == nil || size <= 0 || ttl <= 0 {
		return e
	}
	return &lruEmbedder{
		next:  e,
		cache: expirable.NewLRU[string, []float32](size, nil, ttl),
	}
}

type lruEmbedder struct {
	next  ai.IEmbedder
	cache *expirable.LRU[string, []float32]
}

func (l *lruEmbedder) Embed(ctx context.Context, text string, taskType string) ([]float32, error) {
	if l == nil || l.next == nil {
		return nil, nil
	}
	cacheKey, _, _ := buildCacheKey(l.next.ModelName(), taskType, text)
	if cached, ok := l.cache.Get(cacheKey); ok {
		logutil.GetLogger(ctx).Debug("embedding cache hit (lru)", zap.String("task_type", taskType))
		return cloneEmbedding(cached), nil
	}
	res, err := l.next.Embed(ctx, text, taskType)
	if err != nil {
		return nil, err
	}
	l.cache.Add(cacheKey, cloneEmbedding(res))
	return res, nil
}

func (l *lruEmbedder) ModelName() string {
	if l == nil || l.next == nil {
		return ""
	}
	return l.next.ModelName()
}

func cloneEmbedding(values []float32) []float32 {
	if len(values) == 0 {
		return nil
	}
	clone := make([]float32, len(values))
	copy(clone, values)
	return clone
}
