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
	provider       ai.IAIProvider
	embeddings     *repo.EmbeddingRepo
	model          string
	embeddingModel string
	maxInputChars  int
	timeout        time.Duration
	cache          *expirable.LRU[string, string]
}

func NewAIService(provider ai.IAIProvider, embeddings *repo.EmbeddingRepo, model string, embeddingModel string, maxInputChars int, timeoutSeconds int) *AIService {
	cache := expirable.NewLRU[string, string](10000, nil, 2*time.Hour)
	return &AIService{
		provider:       provider,
		embeddings:     embeddings,
		model:          model,
		embeddingModel: embeddingModel,
		maxInputChars:  maxInputChars,
		timeout:        time.Duration(timeoutSeconds) * time.Second,
		cache:          cache,
	}
}

func (s *AIService) Embed(ctx context.Context, text string, taskType string) ([]float32, error) {
	if s.embeddingModel == "" {
		return nil, fmt.Errorf("embedding model not configured")
	}
	return s.provider.Embed(ctx, s.embeddingModel, text, taskType)
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
	prompt := fmt.Sprintf(`You are a professional editor.
Polish the following markdown to be more professional and clear without changing the meaning.
- Use the same language as the content.
- Keep all markdown structure and formatting.
- Do not add explanations.
- Output ONLY the polished markdown.

CONTENT:
%s`, text)
	return s.generateText(ctx, s.model, prompt)
}

func (s *AIService) Generate(ctx context.Context, prompt string) (string, error) {
	text, err := s.cleanInput(prompt)
	if err != nil {
		return "", err
	}
	fullPrompt := fmt.Sprintf(`You are a helpful writer.
Generate a complete markdown article based on the description below.
- Use clear sections and headings when appropriate.
- Output ONLY the generated markdown.

DESCRIPTION:
%s`, text)
	return s.generateText(ctx, s.model, fullPrompt)
}

func (s *AIService) ExtractTags(ctx context.Context, input string, maxTags int) ([]string, error) {
	text, err := s.cleanInput(input)
	if err != nil {
		return nil, err
	}
	if maxTags <= 0 {
		maxTags = 7
	}
	if maxTags > 20 {
		maxTags = 20
	}
	prompt := fmt.Sprintf(`You are a tag extraction assistant.
From the markdown below, extract up to %d concise tags.
- Tags should be short phrases (1-3 words).
- Return a JSON array of strings only. No extra text.
- Use the same language as the content.

CONTENT:
%s`, maxTags, text)
	result, err := s.generateText(ctx, s.model, prompt)
	if err != nil {
		return nil, err
	}
	return parseTags(result, maxTags)
}

func (s *AIService) Summarize(ctx context.Context, input string) (string, error) {
	text, err := s.cleanInput(input)
	if err != nil {
		return "", err
	}
	prompt := fmt.Sprintf(`You are a helpful assistant.
Summarize the following markdown into a concise paragraph (2-4 sentences).
- Use the same language as the content.
- Keep factual accuracy and key points.
- Output ONLY the summary text.

CONTENT:
%s`, text)
	return s.generateText(ctx, s.model, prompt)
}

func (s *AIService) cleanInput(input string) (string, error) {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return "", appErr.ErrInvalid
	}
	if s.maxInputChars > 0 && len(trimmed) > s.maxInputChars {
		return "", appErr.ErrInvalid
	}
	return trimmed, nil
}

func (s *AIService) generateText(ctx context.Context, model, prompt string) (string, error) {
	if s.provider == nil {
		return "", ErrAIUnavailable
	}
	if model == "" {
		return "", appErr.ErrInvalid
	}
	cacheKey := s.cacheKey(model, prompt)
	if cached, ok := s.cache.Get(cacheKey); ok {
		return cached, nil
	}
	if s.timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, s.timeout)
		defer cancel()
	}
	resp, err := s.provider.Generate(ctx, model, prompt)
	if err != nil {
		return "", err
	}
	text := strings.TrimSpace(resp)
	if text == "" {
		return "", appErr.ErrInternal
	}
	s.cache.Add(cacheKey, text)
	return text, nil
}

func (s *AIService) cacheKey(model, prompt string) string {
	hash := sha256.Sum256([]byte(prompt))
	return model + ":" + hex.EncodeToString(hash[:])
}

func parseTags(output string, maxTags int) ([]string, error) {
	clean := strings.TrimSpace(output)
	clean = strings.TrimPrefix(clean, "```json")
	clean = strings.TrimPrefix(clean, "```")
	clean = strings.TrimSuffix(clean, "```")
	clean = strings.TrimSpace(clean)
	start := strings.Index(clean, "[")
	end := strings.LastIndex(clean, "]")
	if start >= 0 && end > start {
		clean = clean[start : end+1]
	}

	var tags []string
	if err := json.Unmarshal([]byte(clean), &tags); err != nil {
		return nil, appErr.ErrInvalid
	}
	uniq := make([]string, 0, len(tags))
	seen := make(map[string]bool)
	for _, tag := range tags {
		normalized := strings.TrimSpace(tag)
		if normalized == "" {
			continue
		}
		key := strings.ToLower(normalized)
		if seen[key] {
			continue
		}
		seen[key] = true
		uniq = append(uniq, normalized)
		if len(uniq) >= maxTags {
			break
		}
	}
	if len(uniq) == 0 {
		return nil, appErr.ErrInvalid
	}
	return uniq, nil
}
