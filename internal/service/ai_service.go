package service

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/hashicorp/golang-lru/v2/expirable"
	"github.com/xxxsen/common/logutil"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/ai"
	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
	"github.com/xxxsen/mnote/internal/repo"
)

var (
	ErrAIUnavailable  = ai.ErrUnavailable
	errInputTextEmpty = errors.New("input text to generate")
)

type AIService struct {
	db         *sql.DB
	manager    aiManager
	embeddings embeddingRepo
	chunker    aiChunker
	cache      *expirable.LRU[string, string]
}

func NewAIService(db *sql.DB, manager *ai.Manager, embeddings embeddingRepo) *AIService {
	cache := expirable.NewLRU[string, string](10000, nil, 2*time.Hour)
	return &AIService{
		db:         db,
		manager:    manager,
		embeddings: embeddings,
		chunker:    ai.NewChunker(manager),
		cache:      cache,
	}
}

func newAIServiceFromInterfaces(
	manager aiManager, embeddings embeddingRepo, chunker aiChunker,
) *AIService {
	cache := expirable.NewLRU[string, string](10000, nil, 2*time.Hour)
	return &AIService{
		manager:    manager,
		embeddings: embeddings,
		chunker:    chunker,
		cache:      cache,
	}
}

func (s *AIService) runInTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if s.db == nil {
		return fn(ctx)
	}
	if err := repo.RunInTx(ctx, s.db, fn); err != nil {
		return fmt.Errorf("run in tx: %w", err)
	}
	return nil
}

func (s *AIService) Embed(ctx context.Context, text, taskType string) ([]float32, error) {
	v0, err := s.manager.Embed(ctx, text, taskType)
	if err != nil {
		return nil, fmt.Errorf("embed: %w", err)
	}
	return v0, nil
}

func (s *AIService) SemanticSearch(
	ctx context.Context, userID, query string, topK int, excludeID string,
) ([]string, []float32, error) {
	query = strings.TrimSpace(query)
	logger := logutil.GetLogger(ctx).With(zap.String("user_id", userID), zap.String("query", query))
	queryEmb, err := s.Embed(ctx, query, "RETRIEVAL_QUERY")
	if err != nil {
		logger.Error("failed to embed search query", zap.Error(err))
		return nil, nil, fmt.Errorf("embed search query: %w", err)
	}

	recallTopK := 80
	threshold := float32(0.4)
	chunkResults, err := s.embeddings.SearchChunks(ctx, userID, queryEmb, threshold, recallTopK)
	if err != nil {
		logger.Error("failed to search chunks", zap.Error(err))
		return nil, nil, fmt.Errorf("search chunks: %w", err)
	}
	logger.Debug("vector recall finished", zap.Int("results", len(chunkResults)))

	docMap := groupChunksByDoc(chunkResults, excludeID)
	logger.Debug("grouped chunks by document", zap.Int("total_docs", len(docMap)))
	ranked := rankDocuments(docMap, logger)
	sort.Slice(ranked, func(i, j int) bool {
		return ranked[i].score > ranked[j].score
	})
	if len(ranked) > topK {
		ranked = ranked[:topK]
	}
	ids := make([]string, 0, len(ranked))
	scores := make([]float32, 0, len(ranked))
	for _, res := range ranked {
		ids = append(ids, res.docID)
		scores = append(scores, res.score)
	}
	logger.Info("optimized semantic search performed", zap.Int("results", len(ids)))
	return ids, scores, nil
}

type docScoreGroup struct {
	chunks []repo.ChunkSearchResult
}

type rankedDoc struct {
	docID string
	score float32
}

func groupChunksByDoc(results []repo.ChunkSearchResult, excludeID string) map[string]*docScoreGroup {
	docMap := make(map[string]*docScoreGroup)
	for _, res := range results {
		if res.DocumentID == excludeID {
			continue
		}
		if _, ok := docMap[res.DocumentID]; !ok {
			docMap[res.DocumentID] = &docScoreGroup{}
		}
		if len(docMap[res.DocumentID].chunks) < 3 {
			docMap[res.DocumentID].chunks = append(docMap[res.DocumentID].chunks, res)
		}
	}
	return docMap
}

func rankDocuments(docMap map[string]*docScoreGroup, logger *zap.Logger) []rankedDoc {
	const beta = 0.07
	typeWeight := map[model.ChunkType]float64{
		model.ChunkTypeText: 1.0, model.ChunkTypeMixed: 0.9, model.ChunkTypeCode: 0.7,
	}
	results := make([]rankedDoc, 0, len(docMap))
	for docID, ds := range docMap {
		scoreDoc := computeWeightedScore(ds.chunks, typeWeight)
		hitChunks := float64(len(ds.chunks))
		scoreFinal := scoreDoc * float32(1.0+beta*math.Log1p(hitChunks))
		logger.Debug("fusion score",
			zap.String("doc_id", docID),
			zap.Float32("base", scoreDoc),
			zap.Float32("final", scoreFinal),
		)
		results = append(results, rankedDoc{docID: docID, score: scoreFinal})
	}
	return results
}

const scoreAlpha = 4.0

func computeWeightedScore(
	chunks []repo.ChunkSearchResult, typeWeight map[model.ChunkType]float64,
) float32 {
	var sumWeightScore, sumWeight float64
	for _, c := range chunks {
		tw := typeWeight[c.ChunkType]
		if tw == 0 {
			tw = 0.7
		}
		w := math.Exp(scoreAlpha*float64(c.Score)) * tw
		sumWeightScore += w * float64(c.Score)
		sumWeight += w
	}
	if sumWeight == 0 {
		return 0
	}
	return float32(sumWeightScore / sumWeight)
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
		return fmt.Errorf("chunk document: %w", err)
	}

	now := timeutil.NowUnix()
	var chunkEmbeddings []*model.ChunkEmbedding
	for i, chunk := range chunks {
		logger.Debug("embedding chunk", zap.Int("index", i), zap.Int("total", len(chunks)), zap.Int("tokens",
			chunk.TokenCount))
		emb, err := s.Embed(ctx, chunk.Content, "RETRIEVAL_DOCUMENT")
		if err != nil {
			logger.Error("failed to embed chunk", zap.Error(err), zap.Int("position", chunk.Position))
			return fmt.Errorf("embed chunk %d: %w", chunk.Position, err)
		}
		chunk.ChunkID = fmt.Sprintf("%s_%d", docID, chunk.Position)
		chunk.DocumentID = docID
		chunk.UserID = userID
		chunk.Embedding = emb
		chunk.Mtime = now
		chunkEmbeddings = append(chunkEmbeddings, chunk)
	}

	if err := s.runInTx(ctx, func(txCtx context.Context) error {
		if err := s.embeddings.DeleteChunksByDocID(txCtx, docID); err != nil {
			return fmt.Errorf("delete old chunks: %w", err)
		}
		if err := s.embeddings.SaveChunks(txCtx, chunkEmbeddings); err != nil {
			return fmt.Errorf("save chunks: %w", err)
		}
		if err := s.embeddings.Save(txCtx, &model.DocumentEmbedding{
			DocumentID:  docID,
			UserID:      userID,
			ContentHash: contentHash,
			Mtime:       now,
		}); err != nil {
			return fmt.Errorf("save embedding record: %w", err)
		}
		return nil
	}); err != nil {
		logger.Error("failed to sync embedding chunks", zap.Error(err))
		return err
	}

	logger.Info("embedding and chunks synced", zap.String("title", title), zap.Int("chunks", len(chunks)))
	return nil
}

func (s *AIService) ProcessPendingEmbeddings(ctx context.Context, delaySeconds int64) error {
	if s == nil || s.embeddings == nil {
		return nil
	}
	cutoff := timeutil.NowUnix() - clampDelay(delaySeconds)
	docs, err := s.embeddings.ListStaleDocuments(ctx, 50, cutoff)
	if err != nil {
		logutil.GetLogger(ctx).Error("failed to list stale documents", zap.Error(err))
		return fmt.Errorf("list stale documents: %w", err)
	}
	if len(docs) == 0 {
		return nil
	}
	logutil.GetLogger(ctx).Info("processing stale embeddings", zap.Int("count", len(docs)))
	for _, doc := range docs {
		if err := checkCtx(ctx); err != nil {
			return err
		}
		if err := s.processOneEmbedding(ctx, doc); err != nil {
			return err
		}
	}
	return nil
}

func (s *AIService) processOneEmbedding(ctx context.Context, doc model.Document) error {
	logger := logutil.GetLogger(ctx)
	err := s.SyncEmbedding(ctx, doc.UserID, doc.ID, doc.Title, doc.Content)
	if err != nil {
		if isRateLimitErr(err) {
			logger.Warn("ai rate limit triggered, cooling down...", zap.Error(err))
			return waitCtx(ctx, 10*time.Second)
		}
		logger.Error("failed to sync embeddings", zap.String("doc_id", doc.ID), zap.Error(err))
	}
	return waitCtx(ctx, 100*time.Millisecond)
}

func clampDelay(d int64) int64 {
	if d < 0 {
		return 0
	}
	return d
}

func isRateLimitErr(err error) bool {
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "rate limit") ||
		strings.Contains(msg, "too many requests") ||
		strings.Contains(msg, "status 429") ||
		strings.Contains(msg, "code 429") ||
		strings.Contains(msg, "http 429")
}

func checkCtx(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return fmt.Errorf("check context: %w", ctx.Err())
	default:
		return nil
	}
}

func waitCtx(ctx context.Context, d time.Duration) error {
	select {
	case <-ctx.Done():
		return fmt.Errorf("wait context: %w", ctx.Err())
	case <-time.After(d):
		return nil
	}
}

func (s *AIService) Polish(ctx context.Context, input string) (string, error) {
	text := s.cleanInput(input)
	cacheKey := s.cacheKey("polish", text)
	if cached, ok := s.cache.Get(cacheKey); ok {
		return cached, nil
	}
	if len(text) == 0 {
		return "", nil
	}
	res, err := s.manager.Polish(ctx, text)
	if err != nil {
		return "", fmt.Errorf("polish: %w", err)
	}
	s.cache.Add(cacheKey, res)
	return res, nil
}

func (s *AIService) Generate(ctx context.Context, prompt string) (string, error) {
	text := s.cleanInput(prompt)
	cacheKey := s.cacheKey("generate", text)
	if cached, ok := s.cache.Get(cacheKey); ok {
		return cached, nil
	}
	if len(text) == 0 {
		return "", errInputTextEmpty
	}
	res, err := s.manager.Generate(ctx, text)
	if err != nil {
		return "", fmt.Errorf("generate: %w", err)
	}
	s.cache.Add(cacheKey, res)
	return res, nil
}

func (s *AIService) ExtractTags(ctx context.Context, input string, maxTags int) ([]string, error) {
	text := s.cleanInput(input)
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
		return nil, fmt.Errorf("extract tags: %w", err)
	}
	if data, err := json.Marshal(res); err == nil {
		s.cache.Add(cacheKey, string(data))
	}
	return res, nil
}

func (s *AIService) Summarize(ctx context.Context, input string) (string, error) {
	text := s.cleanInput(input)
	cacheKey := s.cacheKey("summary", text)
	if cached, ok := s.cache.Get(cacheKey); ok {
		return cached, nil
	}
	if len(text) == 0 {
		return "", nil
	}
	res, err := s.manager.Summarize(ctx, text)
	if err != nil {
		return "", fmt.Errorf("summarize: %w", err)
	}
	s.cache.Add(cacheKey, res)
	return res, nil
}

func (s *AIService) cleanInput(input string) string {
	trimmed := strings.TrimSpace(input)
	if trimmed == "" {
		return ""
	}
	maxChars := s.manager.MaxInputChars()
	if maxChars > 0 && utf8.RuneCountInString(trimmed) > maxChars {
		trimmed = string([]rune(trimmed)[:maxChars])
	}
	return trimmed
}

func (s *AIService) cacheKey(feature, text string) string {
	hash := sha256.Sum256([]byte(text))
	return feature + ":" + hex.EncodeToString(hash[:])
}
