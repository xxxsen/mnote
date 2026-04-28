package embedcache

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/xxxsen/common/logutil"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/ai"
	"github.com/xxxsen/mnote/internal/model"
)

type EmbeddingCacheStore interface {
	Get(ctx context.Context, modelName, taskType, contentHash string) ([]float32, bool, error)
	Save(ctx context.Context, item *model.EmbeddingCache) error
}

func WrapDBCacheToEmbedder(
	e ai.IEmbedder, cacheRepo EmbeddingCacheStore,
) ai.IEmbedder {
	if e == nil || cacheRepo == nil {
		return e
	}
	return &dbEmbedder{next: e, repo: cacheRepo}
}

type dbEmbedder struct {
	next ai.IEmbedder
	repo EmbeddingCacheStore
}

func (d *dbEmbedder) Embed(
	ctx context.Context, text, taskType string,
) ([]float32, error) {
	if d == nil || d.next == nil {
		return nil, nil
	}
	_, contentHash, modelName := buildCacheKey(
		d.next.ModelName(), taskType, text,
	)
	if d.repo != nil {
		values, ok, err := d.repo.Get(ctx, modelName, taskType, contentHash)
		if err != nil {
			return nil, fmt.Errorf("get embedding cache: %w", err)
		}
		if ok {
			logutil.GetLogger(ctx).Debug(
				"embedding cache hit (db)",
				zap.String("task_type", taskType),
			)
			return values, nil
		}
	}
	res, err := d.next.Embed(ctx, text, taskType)
	if err != nil {
		return nil, fmt.Errorf("embed via next: %w", err)
	}
	if d.repo != nil {
		if err := d.repo.Save(ctx, &model.EmbeddingCache{
			ModelName:   modelName,
			TaskType:    taskType,
			ContentHash: contentHash,
			Embedding:   res,
			Ctime:       time.Now().Unix(),
		}); err != nil {
			logutil.GetLogger(ctx).Warn(
				"failed to cache embedding", zap.Error(err),
			)
		}
	}
	return res, nil
}

func (d *dbEmbedder) ModelName() string {
	if d == nil || d.next == nil {
		return ""
	}
	return d.next.ModelName()
}

func buildCacheKey(
	modelName, taskType, text string,
) (string, string, string) {
	modelName = strings.TrimSpace(modelName)
	if modelName == "" {
		modelName = "unknown"
	}
	hash := sha256.Sum256([]byte(text))
	contentHash := hex.EncodeToString(hash[:])
	return "embed:" + modelName + ":" + taskType + ":" + contentHash,
		contentHash, modelName
}
