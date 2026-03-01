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
	"github.com/xxxsen/mnote/internal/repo"
)

var ErrAIUnavailable = ai.ErrUnavailable

type AIService struct {
	manager    *ai.Manager
	embeddings *repo.EmbeddingRepo
	chunker    *ai.Chunker
	cache      *expirable.LRU[string, string]
}

func NewAIService(manager *ai.Manager, embeddings *repo.EmbeddingRepo) *AIService {
	cache := expirable.NewLRU[string, string](10000, nil, 2*time.Hour)
	return &AIService{
		manager:    manager,
		embeddings: embeddings,
		chunker:    ai.NewChunker(manager),
		cache:      cache,
	}
}

func (s *AIService) Embed(ctx context.Context, text string, taskType string) ([]float32, error) {
	return s.manager.Embed(ctx, text, taskType)
}

func (s *AIService) SemanticSearch(ctx context.Context, userID, query string, topK int, excludeID string) ([]string, []float32, error) {
	query = strings.TrimSpace(query)
	logger := logutil.GetLogger(ctx).With(zap.String("user_id", userID), zap.String("query", query))
	queryEmb, err := s.Embed(ctx, query, "RETRIEVAL_QUERY")
	if err != nil {
		logger.Error("failed to embed search query", zap.Error(err))
		return nil, nil, err
	}

	recallTopK := 80
	threshold := float32(0.4)
	chunkResults, err := s.embeddings.SearchChunks(ctx, userID, queryEmb, threshold, recallTopK)
	if err != nil {
		logger.Error("failed to search chunks", zap.Error(err))
		return nil, nil, err
	}
	logger.Debug("vector recall finished", zap.Int("results", len(chunkResults)))

	type docScores struct {
		chunks []repo.ChunkSearchResult
	}
	docMap := make(map[string]*docScores)
	for _, res := range chunkResults {
		if res.DocumentID == excludeID {
			continue
		}
		if _, ok := docMap[res.DocumentID]; !ok {
			docMap[res.DocumentID] = &docScores{}
		}
		if len(docMap[res.DocumentID].chunks) < 3 {
			docMap[res.DocumentID].chunks = append(docMap[res.DocumentID].chunks, res)
		}
	}
	logger.Debug("grouped chunks by document", zap.Int("total_docs", len(docMap)))

	alpha := 4.0
	beta := 0.07
	typeWeight := map[model.ChunkType]float64{
		model.ChunkTypeText:  1.0,
		model.ChunkTypeMixed: 0.9,
		model.ChunkTypeCode:  0.7,
	}

	type finalResult struct {
		docID string
		score float32
	}
	var finalResults []finalResult

	for docID, ds := range docMap {
		var sumWeightScore float64
		var sumWeight float64
		for _, c := range ds.chunks {
			tw := typeWeight[c.ChunkType]
			if tw == 0 {
				tw = 0.7
			}
			w := math.Exp(alpha*float64(c.Score)) * tw
			sumWeightScore += w * float64(c.Score)
			sumWeight += w
		}
		scoreDoc := float32(sumWeightScore / sumWeight)
		hitChunks := float64(len(ds.chunks))
		for _, c := range ds.chunks {
			logger.Debug("chunk match detail", zap.String("doc_id", docID), zap.Float32("chunk_score", c.Score), zap.String("type", string(c.ChunkType)))
		}
		scoreFinal := scoreDoc * float32(1.0+beta*math.Log1p(hitChunks))
		logger.Debug("fusion score calculated",
			zap.String("doc_id", docID),
			zap.Float32("base_score", scoreDoc),
			zap.Float64("hits", hitChunks),
			zap.Float32("final_score", scoreFinal),
		)
		finalResults = append(finalResults, finalResult{docID: docID, score: scoreFinal})
	}

	sort.Slice(finalResults, func(i, j int) bool {
		return finalResults[i].score > finalResults[j].score
	})

	if len(finalResults) > topK {
		finalResults = finalResults[:topK]
	}

	ids := make([]string, 0, len(finalResults))
	scores := make([]float32, 0, len(finalResults))
	for _, res := range finalResults {
		ids = append(ids, res.docID)
		scores = append(scores, res.score)
	}

	logger.Info("optimized semantic search performed", zap.Int("results", len(ids)))
	return ids, scores, nil
}

func (s *AIService) SyncEmbedding(ctx context.Context, userID, docID, title, content string) error {
	if s == nil || s.embeddings == nil {
		return nil
	}
	logger := logutil.GetLogger(ctx).With(zap.String("user_id", userID), zap.String("doc_id", docID))

	textToHash := fmt.Sprintf("%s\n%s", title, content)
	hash := sha256.Sum256([]byte(textToHash))
	contentHash := hex.EncodeToString(hash[:])

	existing, err := s.embeddings.GetByDocID(ctx, docID)
	if err == nil && existing.ContentHash == contentHash {
		return nil
	}

	chunks, err := s.chunker.Chunk(ctx, content)
	if err != nil {
		logger.Error("failed to chunk document", zap.Error(err))
		return err
	}

	now := time.Now().Unix()
	var chunkEmbeddings []*model.ChunkEmbedding
	for i, chunk := range chunks {
		logger.Debug("embedding chunk", zap.Int("index", i), zap.Int("total", len(chunks)), zap.Int("tokens", chunk.TokenCount))
		emb, err := s.Embed(ctx, chunk.Content, "RETRIEVAL_DOCUMENT")
		if err != nil {
			logger.Error("failed to embed chunk", zap.Error(err), zap.Int("position", chunk.Position))
			return err
		}
		chunk.ChunkID = fmt.Sprintf("%s_%d", docID, chunk.Position)
		chunk.DocumentID = docID
		chunk.UserID = userID
		chunk.Embedding = emb
		chunk.Mtime = now
		chunkEmbeddings = append(chunkEmbeddings, chunk)
	}

	if err := s.embeddings.DeleteChunksByDocID(ctx, docID); err != nil {
		logger.Error("failed to delete old chunks", zap.Error(err))
		return err
	}
	if err := s.embeddings.SaveChunks(ctx, chunkEmbeddings); err != nil {
		logger.Error("failed to save chunks", zap.Error(err))
		return err
	}

	if err := s.embeddings.Save(ctx, &model.DocumentEmbedding{
		DocumentID:  docID,
		UserID:      userID,
		ContentHash: contentHash,
		Mtime:       now,
	}); err != nil {
		logger.Error("failed to save doc embedding record", zap.Error(err))
		return err
	}

	logger.Info("embedding and chunks synced", zap.String("title", title), zap.Int("chunks", len(chunks)))
	return nil
}

func (s *AIService) ProcessPendingEmbeddings(ctx context.Context, delaySeconds int64) error {
	if s == nil || s.embeddings == nil {
		return nil
	}
	if delaySeconds < 0 {
		delaySeconds = 0
	}
	cutoff := time.Now().Unix() - delaySeconds
	docs, err := s.embeddings.ListStaleDocuments(ctx, 50, cutoff)
	if err != nil {
		logutil.GetLogger(ctx).Error("failed to list stale documents", zap.Error(err))
		return err
	}
	if len(docs) == 0 {
		return nil
	}
	logutil.GetLogger(ctx).Info("processing stale embeddings", zap.Int("count", len(docs)))
	for _, doc := range docs {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		err := s.SyncEmbedding(ctx, doc.UserID, doc.ID, doc.Title, doc.Content)
		if err != nil {
			// Check for rate limit. This depends on provider implementation.
			// Most standard providers return error messages containing "rate limit" or 429.
			errMsg := strings.ToLower(err.Error())
			if strings.Contains(errMsg, "rate") || strings.Contains(errMsg, "limit") || strings.Contains(errMsg, "429") {
				logutil.GetLogger(ctx).Warn("ai rate limit triggered, cooling down...", zap.Error(err))
				select {
				case <-ctx.Done():
					return ctx.Err()
				case <-time.After(10 * time.Second):
				}
				continue
			}
			logutil.GetLogger(ctx).Error("failed to sync embeddings", zap.String("doc_id", doc.ID), zap.Error(err))
		}
		// Small delay to avoid hammering the API
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(100 * time.Millisecond):
		}
	}
	return nil
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
	if len(text) == 0 {
		return "", nil
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
	if len(text) == 0 {
		return "", fmt.Errorf("input text to generate")
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
	if len(text) == 0 {
		return []string{}, nil
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
	if len(text) == 0 {
		return "", nil
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
		return "", nil
	}
	max := s.manager.MaxInputChars()
	if max > 0 && len(trimmed) > max {
		trimmed = trimmed[:max] //不报错，直接进行截断
	}
	return trimmed, nil
}

func (s *AIService) cacheKey(feature, text string) string {
	hash := sha256.Sum256([]byte(text))
	return feature + ":" + hex.EncodeToString(hash[:])
}
