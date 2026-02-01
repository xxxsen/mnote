package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"sort"
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
	allEmbs, err := s.embeddings.ListByUser(ctx, userID)
	if err != nil {
		logger.Error("failed to list embeddings", zap.Error(err))
		return nil, err
	}
	type match struct {
		docID string
		score float32
	}
	// Threshold for semantic similarity.
	// Dense embeddings are noisy. 0.55-0.65 is generally a safe range for Chinese tech terms.
	threshold := float32(0.55)
	if len([]rune(query)) <= 2 {
		threshold = 0.70 // Be very strict with tiny queries
	}

	matches := make([]match, 0, len(allEmbs))
	for _, item := range allEmbs {
		score := cosineSimilarity(queryEmb, item.Embedding)
		if score >= threshold {
			matches = append(matches, match{docID: item.DocumentID, score: score})
		}
	}
	sort.Slice(matches, func(i, j int) bool {
		return matches[i].score > matches[j].score
	})
	if topK > len(matches) {
		topK = len(matches)
	}
	result := make([]string, 0, topK)
	for i := 0; i < topK; i++ {
		logger.Debug("semantic match", zap.String("doc_id", matches[i].docID), zap.Float32("score", matches[i].score))
		result = append(result, matches[i].docID)
	}
	return result, nil
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
		logger.Error("failed to generate embedding", zap.Error(err))
		return err
	}

	if err := s.embeddings.Save(ctx, &model.DocumentEmbedding{
		DocumentID:  docID,
		UserID:      userID,
		Embedding:   emb,
		ContentHash: contentHash,
		Mtime:       time.Now().UnixMilli(),
	}); err != nil {
		logger.Error("failed to save embedding", zap.Error(err))
		return err
	}
	logger.Info("embedding synced")
	return nil
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
