package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/hashicorp/golang-lru/v2/expirable"
	"github.com/xxxsen/common/logutil"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/ai"
	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/repo"
)

var ErrAIUnavailable = ai.ErrUnavailable

type AIService struct {
	manager    *ai.Manager
	embeddings *repo.EmbeddingRepo
	cache      *expirable.LRU[string, string]
}

func NewAIService(manager *ai.Manager, embeddings *repo.EmbeddingRepo) *AIService {
	cache := expirable.NewLRU[string, string](10000, nil, 2*time.Hour)
	return &AIService{
		manager:    manager,
		embeddings: embeddings,
		cache:      cache,
	}
}

func (s *AIService) Embed(ctx context.Context, text string, taskType string) ([]float32, error) {
	return s.manager.Embed(ctx, text, taskType)
}

func (s *AIService) SemanticSearch(ctx context.Context, userID, query string, topK int) ([]string, error) {
	logger := logutil.GetLogger(ctx).With(zap.String("user_id", userID), zap.String("query", query))
	queryEmb, err := s.Embed(ctx, query, "RETRIEVAL_QUERY")
	if err != nil {
		logger.Error("failed to embed search query", zap.Error(err))
		return nil, err
	}

	threshold := float32(0.55)
	if len([]rune(query)) <= 2 {
		threshold = 0.70
	}

	res, err := s.embeddings.Search(ctx, userID, queryEmb, threshold, topK)
	if err != nil {
		logger.Error("failed to search in database", zap.Error(err))
		return nil, err
	}
	return res, nil
}

func (s *AIService) SyncEmbedding(ctx context.Context, userID, docID, title, content string) error {
	if s == nil || s.embeddings == nil {
		return nil
	}
	logger := logutil.GetLogger(ctx).With(zap.String("user_id", userID), zap.String("doc_id", docID))
	// Mix title and content to improve recall
	textToEmbed := fmt.Sprintf("%s\n%s", title, content)
	hash := sha256.Sum256([]byte(textToEmbed))
	contentHash := hex.EncodeToString(hash[:])

	existing, err := s.embeddings.GetByDocID(ctx, docID)
	if err == nil && existing.ContentHash == contentHash {
		return nil
	}

	emb, err := s.Embed(ctx, textToEmbed, "RETRIEVAL_DOCUMENT")
	if err != nil {
		logger.Error("failed to generate embedding", zap.Error(err), zap.String("title", title))
		return err
	}

	if err := s.embeddings.Save(ctx, &model.DocumentEmbedding{
		DocumentID:  docID,
		UserID:      userID,
		Embedding:   emb,
		ContentHash: contentHash,
		Mtime:       time.Now().Unix(),
	}); err != nil {
		logger.Error("failed to save embedding", zap.Error(err), zap.String("title", title))
		return err
	}
	logger.Info("embedding synced", zap.String("title", title))
	return nil
}

func (s *AIService) StartWorker(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.processPendingEmbeddings(ctx)
			}
		}
	}()
}

func (s *AIService) processPendingEmbeddings(ctx context.Context) {
	docs, err := s.embeddings.ListStaleDocuments(ctx, 50)
	if err != nil {
		logutil.GetLogger(ctx).Error("failed to list stale documents", zap.Error(err))
		return
	}
	if len(docs) == 0 {
		return
	}
	logutil.GetLogger(ctx).Info("processing stale embeddings", zap.Int("count", len(docs)))
	for _, doc := range docs {
		err := s.SyncEmbedding(ctx, doc.UserID, doc.ID, doc.Title, doc.Content)
		if err != nil {
			// Check for rate limit. This depends on provider implementation.
			// Most standard providers return error messages containing "rate limit" or 429.
			errMsg := strings.ToLower(err.Error())
			if strings.Contains(errMsg, "rate") || strings.Contains(errMsg, "limit") || strings.Contains(errMsg, "429") {
				logutil.GetLogger(ctx).Warn("ai rate limit triggered, cooling down...", zap.Error(err))
				time.Sleep(10 * time.Second)
				continue
			}
		}
		// Small delay to avoid hammering the API
		time.Sleep(100 * time.Millisecond)
	}
}

func cosineSimilarity(a, b []float32) float32 {
	if len(a) != len(b) {
		return 0
	}
	var dot, normA, normB float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
		normA += float64(a[i]) * float64(a[i])
		normB += float64(b[i]) * float64(b[i])
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return float32(dot / (math.Sqrt(normA) * math.Sqrt(normB)))
}

func (s *AIService) Polish(ctx context.Context, input string) (string, error) {
	text, err := s.cleanInput(input)
	if err != nil {
		return "", err
	}
	cacheKey := s.cacheKey("polish", text)
	if cached, ok := s.cache.Get(cacheKey); ok {
		return cached, nil
	}
	res, err := s.manager.Polish(ctx, text)
	if err != nil {
		return "", err
	}
	s.cache.Add(cacheKey, res)
	return res, nil
}

func (s *AIService) Generate(ctx context.Context, prompt string) (string, error) {
	text, err := s.cleanInput(prompt)
	if err != nil {
		return "", err
	}
	cacheKey := s.cacheKey("generate", text)
	if cached, ok := s.cache.Get(cacheKey); ok {
		return cached, nil
	}
	res, err := s.manager.Generate(ctx, text)
	if err != nil {
		return "", err
	}
	s.cache.Add(cacheKey, res)
	return res, nil
}

func (s *AIService) ExtractTags(ctx context.Context, input string, maxTags int) ([]string, error) {
	text, err := s.cleanInput(input)
	if err != nil {
		return nil, err
	}
	cacheKey := s.cacheKey("tags", text)
	if cached, ok := s.cache.Get(cacheKey); ok {
		var tags []string
		if err := json.Unmarshal([]byte(cached), &tags); err == nil {
			return tags, nil
		}
	}
	res, err := s.manager.ExtractTags(ctx, text, maxTags)
	if err != nil {
		return nil, err
	}
	if data, err := json.Marshal(res); err == nil {
		s.cache.Add(cacheKey, string(data))
	}
	return res, nil
}

func (s *AIService) Summarize(ctx context.Context, input string) (string, error) {
	text, err := s.cleanInput(input)
	if err != nil {
		return "", err
	}
	cacheKey := s.cacheKey("summary", text)
	if cached, ok := s.cache.Get(cacheKey); ok {
		return cached, nil
	}
	res, err := s.manager.Summarize(ctx, text)
	if err != nil {
		return "", err
	}
	s.cache.Add(cacheKey, res)
	return res, nil
}

func (s *AIService) cleanInput(input string) (string, error) {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return "", appErr.ErrInvalid
	}
	max := s.manager.MaxInputChars()
	if max > 0 && len(trimmed) > max {
		return "", appErr.ErrInvalid
	}
	return trimmed, nil
}

func (s *AIService) cacheKey(feature, text string) string {
	hash := sha256.Sum256([]byte(text))
	return feature + ":" + hex.EncodeToString(hash[:])
}
