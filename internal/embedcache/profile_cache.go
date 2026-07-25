package embedcache

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/hashicorp/golang-lru/v2/expirable"
	"github.com/xxxsen/common/logutil"
	"go.uber.org/zap"
	"golang.org/x/sync/singleflight"

	"github.com/xxxsen/mnote/internal/ai"
	"github.com/xxxsen/mnote/internal/metrics"
	"github.com/xxxsen/mnote/internal/model"
)

var (
	errEmbeddingCacheResultCount = errors.New(
		"cached profile embedder returned an unexpected vector count",
	)
	errEmbeddingCacheSharedResult = errors.New(
		"cached profile embedder returned an invalid shared result",
	)
)

type ProfileCacheStore interface {
	Get(
		ctx context.Context,
		profileID, taskType, contentHash string,
		minCtime int64,
	) ([]float32, bool, error)
	Save(context.Context, model.EmbeddingCacheV2) error
	Delete(ctx context.Context, profileID, taskType, contentHash string) error
}

type cachedProfileEmbedder struct {
	next  ai.ProfileEmbedder
	store ProfileCacheStore
	lru   *expirable.LRU[string, []float32]
	ttl   time.Duration
	group singleflight.Group
	now   func() time.Time
}

type profileCacheMiss struct {
	input       string
	contentHash string
	offset      int
}

func NewCachedProfileEmbedder(
	next ai.ProfileEmbedder,
	store ProfileCacheStore,
	size int,
	ttl time.Duration,
) ai.ProfileEmbedder {
	if next == nil || size <= 0 || ttl <= 0 {
		return next
	}
	return &cachedProfileEmbedder{
		next:  next,
		store: store,
		lru:   expirable.NewLRU[string, []float32](size, nil, ttl),
		ttl:   ttl,
		now:   time.Now,
	}
}

func (e *cachedProfileEmbedder) Profile() ai.ProfileIdentity {
	return e.next.Profile()
}

func (e *cachedProfileEmbedder) EmbedBatch(
	ctx context.Context,
	request ai.EmbeddingRequest,
) (ai.EmbeddingResult, error) {
	if len(request.Inputs) == 0 {
		return ai.EmbeddingResult{Vectors: [][]float32{}}, nil
	}
	profile := e.next.Profile()
	vectors := make([][]float32, len(request.Inputs))
	misses := make([]profileCacheMiss, 0, len(request.Inputs))
	minCtime := e.now().Add(-e.ttl).Unix()

	for offset, input := range request.Inputs {
		cached, hit, contentHash := e.lookup(
			ctx,
			profile,
			request.TaskType,
			input,
			minCtime,
		)
		if hit {
			vectors[offset] = cached
			continue
		}
		misses = append(misses, profileCacheMiss{
			input:       input,
			contentHash: contentHash,
			offset:      offset,
		})
	}
	if len(misses) == 0 {
		return ai.EmbeddingResult{Vectors: vectors, ProviderName: "cache"}, nil
	}

	result, err := e.embedMisses(ctx, request.TaskType, misses)
	if err != nil {
		return ai.EmbeddingResult{}, err
	}
	for index, vector := range result.Vectors {
		miss := misses[index]
		vectors[miss.offset] = cloneEmbedding(vector)
	}
	return ai.EmbeddingResult{
		Vectors:      vectors,
		ProviderName: result.ProviderName,
	}, nil
}

func (e *cachedProfileEmbedder) lookup(
	ctx context.Context,
	profile ai.ProfileIdentity,
	taskType, input string,
	minCtime int64,
) ([]float32, bool, string) {
	contentHash := profileContentHash(input)
	key := profileCacheKey(profile.ID, taskType, contentHash)
	if cached, ok := e.lru.Get(key); ok {
		if validCachedVector(cached, profile.Dimensions) {
			metrics.ObserveEmbeddingCache("lru", "hit")
			return cloneEmbedding(cached), true, contentHash
		}
		metrics.ObserveEmbeddingCache("lru", "invalid")
		e.lru.Remove(key)
	} else {
		metrics.ObserveEmbeddingCache("lru", "miss")
	}
	if e.store == nil {
		return nil, false, contentHash
	}
	cached, ok, err := e.store.Get(
		ctx,
		profile.ID,
		taskType,
		contentHash,
		minCtime,
	)
	if err != nil {
		metrics.ObserveEmbeddingCache("database", "error")
		logutil.GetLogger(ctx).Warn(
			"embedding cache read failed; continuing fail-open",
			zap.String("profile", profile.ID),
			zap.String("layer", "database"),
		)
		return nil, false, contentHash
	}
	if !ok {
		metrics.ObserveEmbeddingCache("database", "miss")
		return nil, false, contentHash
	}
	if validCachedVector(cached, profile.Dimensions) {
		metrics.ObserveEmbeddingCache("database", "hit")
		e.lru.Add(key, cloneEmbedding(cached))
		return cloneEmbedding(cached), true, contentHash
	}
	metrics.ObserveEmbeddingCache("database", "invalid")
	if deleteErr := e.store.Delete(
		ctx,
		profile.ID,
		taskType,
		contentHash,
	); deleteErr != nil {
		logutil.GetLogger(ctx).Warn(
			"invalid embedding cache entry could not be deleted",
			zap.String("profile", profile.ID),
		)
	}
	return nil, false, contentHash
}

func (e *cachedProfileEmbedder) embedMisses(
	ctx context.Context,
	taskType string,
	misses []profileCacheMiss,
) (ai.EmbeddingResult, error) {
	missingInputs := make([]string, 0, len(misses))
	missingHashes := make([]string, 0, len(misses))
	for _, miss := range misses {
		missingInputs = append(missingInputs, miss.input)
		missingHashes = append(missingHashes, miss.contentHash)
	}
	profile := e.next.Profile()
	groupKey := profile.ID + "\x00" + taskType + "\x00" +
		strings.Join(missingHashes, "\x00")
	value, err, _ := e.group.Do(groupKey, func() (any, error) {
		if cached, ok := e.cachedMissResult(
			profile,
			taskType,
			missingHashes,
		); ok {
			return cached, nil
		}
		result, embedErr := e.next.EmbedBatch(ctx, ai.EmbeddingRequest{
			Inputs:   missingInputs,
			TaskType: taskType,
		})
		if embedErr != nil {
			return nil, fmt.Errorf("embed cache misses: %w", embedErr)
		}
		if len(result.Vectors) != len(missingInputs) {
			return nil, fmt.Errorf(
				"%w: got %d vectors for %d misses",
				errEmbeddingCacheResultCount,
				len(result.Vectors),
				len(missingInputs),
			)
		}
		now := e.now().Unix()
		for index, vector := range result.Vectors {
			e.save(
				ctx,
				profile,
				taskType,
				missingHashes[index],
				vector,
				now,
			)
		}
		return result, nil
	})
	if err != nil {
		return ai.EmbeddingResult{}, fmt.Errorf("share embedding cache misses: %w", err)
	}
	result, ok := value.(ai.EmbeddingResult)
	if !ok {
		return ai.EmbeddingResult{}, errEmbeddingCacheSharedResult
	}
	return result, nil
}

func (e *cachedProfileEmbedder) cachedMissResult(
	profile ai.ProfileIdentity,
	taskType string,
	contentHashes []string,
) (ai.EmbeddingResult, bool) {
	vectors := make([][]float32, 0, len(contentHashes))
	for _, contentHash := range contentHashes {
		vector, ok := e.lru.Get(
			profileCacheKey(profile.ID, taskType, contentHash),
		)
		if !ok || !validCachedVector(vector, profile.Dimensions) {
			return ai.EmbeddingResult{}, false
		}
		vectors = append(vectors, cloneEmbedding(vector))
	}
	return ai.EmbeddingResult{
		Vectors:      vectors,
		ProviderName: "cache",
	}, true
}

func (e *cachedProfileEmbedder) save(
	ctx context.Context,
	profile ai.ProfileIdentity,
	taskType, contentHash string,
	vector []float32,
	now int64,
) {
	e.lru.Add(
		profileCacheKey(profile.ID, taskType, contentHash),
		cloneEmbedding(vector),
	)
	if e.store == nil {
		return
	}
	if saveErr := e.store.Save(ctx, model.EmbeddingCacheV2{
		ProfileID:   profile.ID,
		TaskType:    taskType,
		ContentHash: contentHash,
		Dimensions:  profile.Dimensions,
		Embedding:   vector,
		Ctime:       now,
	}); saveErr != nil {
		logutil.GetLogger(ctx).Warn(
			"embedding cache write failed",
			zap.String("profile", profile.ID),
			zap.String("layer", "database"),
		)
	}
}

func profileContentHash(input string) string {
	sum := sha256.Sum256([]byte(input))
	return hex.EncodeToString(sum[:])
}

func profileCacheKey(profileID, taskType, contentHash string) string {
	return profileID + "\x00" + taskType + "\x00" + contentHash
}

func validCachedVector(vector []float32, dimensions int) bool {
	if len(vector) != dimensions {
		return false
	}
	hasMagnitude := false
	for _, value := range vector {
		if math.IsNaN(float64(value)) || math.IsInf(float64(value), 0) {
			return false
		}
		if value != 0 {
			hasMagnitude = true
		}
	}
	return hasMagnitude
}
