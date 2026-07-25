package service

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/xxxsen/common/logutil"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/ai"
	"github.com/xxxsen/mnote/internal/metrics"
	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/dochash"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
	"github.com/xxxsen/mnote/internal/repo"
)

// errEmbeddingStale flags a SyncEmbedding attempt that hit the
// CompleteEmbeddingIfCurrent stale branch. The document has already
// been re-queued under its current hash, so the worker treats this
// as a clean skip rather than a failure that would consume a retry
// budget.
var (
	errEmbeddingStale = errors.New(
		"embedding stale: document content advanced before worker finished",
	)
	errEmbeddingQueryResultCount = errors.New(
		"embedding semantic query returned an invalid result count",
	)
	errEmbeddingActiveGenerationChanged = errors.New(
		"active embedding generation changed during search",
	)
)

type EmbeddingService struct {
	embedder    ai.IEmbedder
	embeddings  embeddingRepo
	chunker     embeddingChunker
	v2          embeddingV2RuntimeRepo
	indexDelay  int64
	v2Embedders map[string]ai.ProfileEmbedder
	v2MinScores map[string]float32
	v2Enabled   bool
}

type embeddingV2RuntimeRepo interface {
	GetActiveGeneration(
		context.Context,
	) (*model.EmbeddingGeneration, *model.EmbeddingProfile, error)
	EnqueueContentChange(
		ctx context.Context,
		userID, documentID, contentHash string,
		revision, now, delaySeconds int64,
	) error
	DeleteDocumentData(ctx context.Context, userID, documentID string) error
	SearchActiveChunks(
		ctx context.Context,
		userID, excludeID string,
		queryEmbedding []float32,
		recallLimit int,
	) (
		*model.EmbeddingGeneration,
		*model.EmbeddingProfile,
		[]model.SemanticChunkResult,
		string,
		error,
	)
	SimilarDocuments(
		ctx context.Context,
		userID, documentID string,
		limit int,
	) (
		*model.EmbeddingGeneration,
		[]model.SimilarDocumentResult,
		bool,
		error,
	)
}

func NewEmbeddingService(embedder ai.IEmbedder, embeddings embeddingRepo) *EmbeddingService {
	return &EmbeddingService{
		embedder:   embedder,
		embeddings: embeddings,
		chunker:    ai.NewChunker(),
	}
}

// DisableLegacyFallback removes the V1 queue/search repository for pure V2
// deployments. Keeping an interface that contains a typed nil would still be
// non-nil in Go, so the assembly layer disables it explicitly.
func (s *EmbeddingService) DisableLegacyFallback() {
	if s != nil {
		s.embeddings = nil
	}
}

func (s *EmbeddingService) ConfigureV2(
	repository embeddingV2RuntimeRepo,
	indexDelaySeconds int64,
	embedders map[string]ai.ProfileEmbedder,
	minScores map[string]float32,
) {
	s.v2 = repository
	s.indexDelay = clampDelay(indexDelaySeconds)
	s.v2Embedders = embedders
	s.v2MinScores = minScores
	s.v2Enabled = true
}

// ConfigureV2Queue keeps current/building/standby jobs synchronized while
// remote embedding work is disabled. This makes ordinary saves independent
// from providers and lets the index converge after the feature is re-enabled.
func (s *EmbeddingService) ConfigureV2Queue(
	repository embeddingV2RuntimeRepo,
	indexDelaySeconds int64,
) {
	s.v2 = repository
	s.indexDelay = clampDelay(indexDelaySeconds)
	s.v2Embedders = nil
	s.v2MinScores = nil
	s.v2Enabled = false
}

func newEmbeddingServiceFromInterfaces(
	embedder ai.IEmbedder, embeddings embeddingRepo, chunker embeddingChunker,
) *EmbeddingService {
	return &EmbeddingService{
		embedder:   embedder,
		embeddings: embeddings,
		chunker:    chunker,
	}
}

func (s *EmbeddingService) Embed(ctx context.Context, text, taskType string) ([]float32, error) {
	if s == nil || s.embedder == nil {
		return nil, ai.ErrNotConfigured
	}
	v0, err := s.embedder.Embed(ctx, text, taskType)
	if err != nil {
		return nil, fmt.Errorf("embed: %w", err)
	}
	return v0, nil
}

func (s *EmbeddingService) SemanticSearch(
	ctx context.Context, userID, query string, topK int, excludeID string,
) ([]string, []float32, error) {
	query = strings.TrimSpace(query)
	if topK <= 0 {
		return []string{}, []float32{}, nil
	}
	if s != nil && s.v2 != nil {
		active, err := s.hasActiveV2(ctx)
		if err != nil {
			return nil, nil, err
		}
		if active {
			return s.semanticSearchV2(ctx, userID, query, topK, excludeID)
		}
	}
	legacySearchStarted := time.Now()
	logger := logutil.GetLogger(ctx).With(
		zap.String("user_id", userID),
		zap.Int("query_length", len([]rune(query))),
	)
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
	metrics.ObserveSemanticSearch(
		"v1",
		time.Since(legacySearchStarted),
		len(chunkResults),
	)
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
		if res.score < semanticSearchV1MinScore {
			continue
		}
		ids = append(ids, res.docID)
		scores = append(scores, res.score)
	}
	logger.Info("optimized semantic search performed", zap.Int("results", len(ids)))
	return ids, scores, nil
}

const semanticSearchV1MinScore float32 = 0.7

func (s *EmbeddingService) semanticSearchV2(
	ctx context.Context,
	userID, query string,
	topK int,
	excludeID string,
) ([]string, []float32, error) {
	matches, err := s.semanticSearchV2Matches(
		ctx,
		userID,
		query,
		topK,
		excludeID,
	)
	if err != nil {
		return nil, nil, err
	}
	ids := make([]string, 0, len(matches))
	scores := make([]float32, 0, len(matches))
	for _, match := range matches {
		ids = append(ids, match.DocumentID)
		scores = append(scores, match.Score)
	}
	return ids, scores, nil
}

func (s *EmbeddingService) SemanticSearchMatches(
	ctx context.Context,
	userID, query string,
	topK int,
	excludeID string,
) ([]model.SemanticSearchMatch, error) {
	if s == nil || s.v2 == nil {
		ids, scores, err := s.SemanticSearch(
			ctx,
			userID,
			query,
			topK,
			excludeID,
		)
		if err != nil {
			return nil, err
		}
		return semanticMatchesFromLegacy(ids, scores), nil
	}
	active, err := s.hasActiveV2(ctx)
	if err != nil {
		return nil, err
	}
	if !active {
		ids, scores, err := s.SemanticSearch(
			ctx,
			userID,
			query,
			topK,
			excludeID,
		)
		if err != nil {
			return nil, err
		}
		return semanticMatchesFromLegacy(ids, scores), nil
	}
	return s.semanticSearchV2Matches(ctx, userID, query, topK, excludeID)
}

func (s *EmbeddingService) semanticSearchV2Matches(
	ctx context.Context,
	userID, query string,
	topK int,
	excludeID string,
) ([]model.SemanticSearchMatch, error) {
	startedAt := time.Now()
	candidateCount := 0
	searchPath := "v2_unknown"
	defer func() {
		metrics.ObserveSemanticSearch(
			searchPath,
			time.Since(startedAt),
			candidateCount,
		)
	}()
	if topK <= 0 {
		return []model.SemanticSearchMatch{}, nil
	}
	var lastErr error
	for range 2 {
		matches, candidates, path, err := s.semanticSearchV2MatchesOnce(
			ctx,
			userID,
			query,
			topK,
			excludeID,
		)
		candidateCount += candidates
		if path != "" {
			searchPath = path
		}
		if err == nil {
			return matches, nil
		}
		if !activeEmbeddingSearchChanged(err) {
			return nil, err
		}
		lastErr = err
	}
	return nil, fmt.Errorf(
		"active embedding generation changed repeatedly: %w",
		errors.Join(ai.ErrUnavailable, lastErr),
	)
}

func (s *EmbeddingService) semanticSearchV2MatchesOnce(
	ctx context.Context,
	userID, query string,
	topK int,
	excludeID string,
) ([]model.SemanticSearchMatch, int, string, error) {
	generation, profile, queryVector, err := s.embedSemanticQueryV2(ctx, query)
	if err != nil {
		return nil, 0, "", err
	}
	searchedGeneration, searchedProfile, chunks, repositoryPath, err := s.v2.SearchActiveChunks(
		ctx,
		userID,
		excludeID,
		queryVector,
		semanticRecallLimit(topK),
	)
	if err != nil {
		return nil, 0, "", fmt.Errorf("search active embedding chunks: %w", err)
	}
	searchPath := ""
	switch repositoryPath {
	case "precise":
		searchPath = "v2_precise"
	case "hnsw":
		searchPath = "v2_hnsw"
	}
	if searchedGeneration.ID != generation.ID ||
		searchedProfile.Fingerprint != profile.Fingerprint ||
		generation.ProfileID != profile.ID {
		return nil, len(chunks), searchPath, errEmbeddingActiveGenerationChanged
	}
	return s.rankSemanticV2Matches(profile.ID, chunks, topK),
		len(chunks),
		searchPath,
		nil
}

func activeEmbeddingSearchChanged(err error) bool {
	return errors.Is(err, errEmbeddingActiveGenerationChanged) ||
		errors.Is(err, repo.ErrEmbeddingActiveChanged)
}

func (s *EmbeddingService) embedSemanticQueryV2(
	ctx context.Context,
	query string,
) (*model.EmbeddingGeneration, *model.EmbeddingProfile, []float32, error) {
	generation, profile, err := s.v2.GetActiveGeneration(ctx)
	if err != nil {
		return nil, nil, nil, fmt.Errorf(
			"get active embedding generation: %w",
			err,
		)
	}
	embedder := s.v2Embedders[profile.ID]
	if embedder == nil ||
		embedder.Profile().Fingerprint != profile.Fingerprint {
		return nil, nil, nil, fmt.Errorf(
			"active embedding profile is not configured: %w",
			ai.ErrUnavailable,
		)
	}
	result, err := embedder.EmbedBatch(ctx, ai.EmbeddingRequest{
		Inputs:   []string{query},
		TaskType: profile.QueryTaskType,
	})
	if err != nil {
		return nil, nil, nil, fmt.Errorf("embed semantic query: %w", err)
	}
	if len(result.Vectors) != 1 {
		return nil, nil, nil, errEmbeddingQueryResultCount
	}
	return generation, profile, result.Vectors[0], nil
}

func semanticRecallLimit(topK int) int {
	recallLimit := topK * 20
	if recallLimit < 200 {
		return 200
	}
	if recallLimit > 1000 {
		return 1000
	}
	return recallLimit
}

func (s *EmbeddingService) rankSemanticV2Matches(
	profileID string,
	chunks []model.SemanticChunkResult,
	topK int,
) []model.SemanticSearchMatch {
	ranked := rankV2Documents(chunks)
	sort.Slice(ranked, func(left, right int) bool {
		if ranked[left].score == ranked[right].score {
			return ranked[left].docID < ranked[right].docID
		}
		return ranked[left].score > ranked[right].score
	})
	minScore, configured := s.v2MinScores[profileID]
	if !configured {
		minScore = 0.55
	}
	matches := make([]model.SemanticSearchMatch, 0, topK)
	for _, item := range ranked {
		score := clampSemanticScore(item.score)
		if score < minScore {
			continue
		}
		matches = append(matches, model.SemanticSearchMatch{
			DocumentID:     item.docID,
			Score:          score,
			MatchedExcerpt: truncateSemanticExcerpt(item.excerpt),
			MatchType:      string(item.chunkType),
		})
		if len(matches) == topK {
			break
		}
	}
	return matches
}

type rankedV2Document struct {
	rankedDoc
	excerpt   string
	chunkType model.ChunkType
}

func rankV2Documents(chunks []model.SemanticChunkResult) []rankedV2Document {
	groups := make(map[string][]model.SemanticChunkResult)
	for _, chunk := range chunks {
		if len(groups[chunk.DocumentID]) >= 3 {
			continue
		}
		groups[chunk.DocumentID] = append(groups[chunk.DocumentID], chunk)
	}
	result := make([]rankedV2Document, 0, len(groups))
	for documentID, items := range groups {
		var weightedScore float64
		var totalWeight float64
		for _, item := range items {
			typeWeight := chunkScoreWeight(item.ChunkType)
			weight := math.Exp(scoreAlpha*float64(item.Score)) * typeWeight
			weightedScore += weight * float64(item.Score)
			totalWeight += weight
		}
		if totalWeight == 0 {
			continue
		}
		score := weightedScore / totalWeight
		score *= 1 + 0.07*math.Log1p(float64(len(items)))
		best := items[0]
		for _, item := range items[1:] {
			if item.Score > best.Score {
				best = item
			}
		}
		result = append(result, rankedV2Document{
			rankedDoc: rankedDoc{
				docID: documentID,
				score: clampSemanticScore(float32(score)),
			},
			excerpt:   best.MatchedText,
			chunkType: best.ChunkType,
		})
	}
	return result
}

func semanticMatchesFromLegacy(
	ids []string,
	scores []float32,
) []model.SemanticSearchMatch {
	result := make([]model.SemanticSearchMatch, 0, len(ids))
	for index, id := range ids {
		score := float32(0)
		if index < len(scores) {
			score = clampSemanticScore(scores[index])
		}
		result = append(result, model.SemanticSearchMatch{
			DocumentID: id,
			Score:      score,
		})
	}
	return result
}

func truncateSemanticExcerpt(value string) string {
	const limit = 240
	runes := []rune(strings.TrimSpace(value))
	if len(runes) <= limit {
		return string(runes)
	}
	return string(runes[:limit]) + "…"
}

func chunkScoreWeight(chunkType model.ChunkType) float64 {
	switch chunkType {
	case model.ChunkTypeTitle:
		return 1.2
	case model.ChunkTypeText:
		return 1
	case model.ChunkTypeMixed:
		return 0.9
	case model.ChunkTypeCode:
		return 0.7
	default:
		return 0.7
	}
}

func clampSemanticScore(score float32) float32 {
	if score < -1 {
		return -1
	}
	if score > 1 {
		return 1
	}
	return score
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

const (
	// embeddingLeaseSeconds is the worker's claim lease. If a worker crashes
	// the row will become eligible again once locked_until elapses without
	// requiring administrative cleanup.
	embeddingLeaseSeconds int64 = 300
	// embeddingBackoffBaseSeconds is the first failure backoff. Each failure
	// doubles the wait up to a cap to keep retries useful without thrashing.
	embeddingBackoffBaseSeconds int64 = 60
	embeddingBackoffMaxSeconds  int64 = 3600
	embeddingMaxLastErrorChars        = 1024
)

// MarkEmbeddingPending is invoked by the save path inside the same DB
// transaction. It is a thin wrapper so the document service does not need to
// know the table layout. When the embeddings repo is unconfigured (tests) it
// is a no-op.
func (s *EmbeddingService) MarkEmbeddingPending(
	ctx context.Context, userID, docID, contentHash string, contentMtime int64,
) error {
	if s == nil || s.embeddings == nil {
		return nil
	}
	if err := s.embeddings.UpsertPending(ctx, docID, userID, contentHash, contentMtime); err != nil {
		return fmt.Errorf("upsert pending: %w", err)
	}
	return nil
}

func (s *EmbeddingService) EnqueueContentChange(
	ctx context.Context,
	userID, docID, contentHash string,
	revision, now int64,
) error {
	if s == nil {
		return nil
	}
	if s.v2 != nil {
		if err := s.v2.EnqueueContentChange(
			ctx,
			userID,
			docID,
			contentHash,
			revision,
			now,
			s.indexDelay,
		); err != nil {
			return fmt.Errorf("enqueue embedding v2: %w", err)
		}
		active, err := s.hasActiveV2(ctx)
		if err != nil {
			return err
		}
		if active {
			return nil
		}
	}
	return s.MarkEmbeddingPending(ctx, userID, docID, contentHash, now)
}

func (s *EmbeddingService) DeleteEmbeddingData(
	ctx context.Context,
	userID, docID string,
) error {
	if s == nil || s.v2 == nil {
		return nil
	}
	if err := s.v2.DeleteDocumentData(ctx, userID, docID); err != nil {
		return fmt.Errorf("delete embedding v2 data: %w", err)
	}
	return nil
}

func (s *EmbeddingService) hasActiveV2(ctx context.Context) (bool, error) {
	if s == nil || s.v2 == nil {
		return false, nil
	}
	_, _, err := s.v2.GetActiveGeneration(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("get active embedding generation: %w", err)
	}
	return true, nil
}

func (s *EmbeddingService) SimilarDocuments(
	ctx context.Context,
	userID, documentID string,
	limit int,
) ([]string, []float32, string, error) {
	if s == nil || s.v2 == nil {
		return []string{}, []float32{}, "disabled", nil
	}
	if !s.v2Enabled {
		return []string{}, []float32{}, "disabled", nil
	}
	active, err := s.hasActiveV2(ctx)
	if err != nil {
		return nil, nil, "", err
	}
	if !active {
		return []string{}, []float32{}, "building", nil
	}
	generation, results, indexed, err := s.similarDocumentsV2(
		ctx,
		userID,
		documentID,
		limit,
	)
	if err != nil {
		return nil, nil, "", fmt.Errorf("search similar documents: %w", err)
	}
	if !indexed {
		return []string{}, []float32{}, "pending", nil
	}
	ids := make([]string, 0, len(results))
	scores := make([]float32, 0, len(results))
	minScore, configured := s.v2MinScores[generation.ProfileID]
	if !configured {
		minScore = 0.55
	}
	for _, result := range results {
		score := clampSemanticScore(result.Score)
		if score < minScore {
			continue
		}
		ids = append(ids, result.DocumentID)
		scores = append(scores, score)
	}
	return ids, scores, "ready", nil
}

func (s *EmbeddingService) similarDocumentsV2(
	ctx context.Context,
	userID, documentID string,
	limit int,
) (
	*model.EmbeddingGeneration,
	[]model.SimilarDocumentResult,
	bool,
	error,
) {
	var lastErr error
	for range 2 {
		generation, results, indexed, err := s.v2.SimilarDocuments(
			ctx,
			userID,
			documentID,
			limit,
		)
		if err == nil {
			return generation, results, indexed, nil
		}
		if !errors.Is(err, repo.ErrEmbeddingActiveChanged) {
			return nil, nil, false, fmt.Errorf(
				"query similar documents: %w",
				err,
			)
		}
		lastErr = err
	}
	return nil, nil, false, fmt.Errorf(
		"active embedding generation changed repeatedly: %w",
		errors.Join(ai.ErrUnavailable, lastErr),
	)
}

// SyncEmbedding chunks the snapshot (title,content) the worker captured at
// scan time, embeds the chunks, and hands the result to
// CompleteEmbeddingIfCurrent. The completion call runs SELECT FOR UPDATE on
// the documents row inside a single transaction: if the locked row still
// hashes to the snapshot's fingerprint, chunks are committed and the
// document_embeddings row is flipped to 'succeeded'; otherwise the
// document has been re-saved since the worker took its snapshot and the
// chunks are discarded — returning errEmbeddingStale so the worker loop
// treats it as a clean skip rather than a retry-consuming failure.
//
// Generating chunk vectors involves remote Embedding calls and cannot live
// inside the documents-row lock; we pay for that by validating against
// the locked hash at completion time instead of trusting the pre-claim
// snapshot. Without that validation a slow worker could silently
// overwrite a freshly-saved body with the previous one's vectors.
func (s *EmbeddingService) SyncEmbedding(ctx context.Context, userID, docID, title, content string) error {
	if s == nil || s.embeddings == nil {
		return nil
	}
	logger := logutil.GetLogger(ctx).With(zap.String("user_id", userID), zap.String("doc_id", docID))

	expectedHash := computeEmbeddingHash(title, content)
	existing, err := s.embeddings.GetByDocID(ctx, docID)
	if err == nil && existing.ContentHash == expectedHash &&
		existing.EmbeddingStatus == model.EmbeddingStatusSucceeded {
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

	applied, err := s.embeddings.CompleteEmbeddingIfCurrent(ctx, userID, docID, expectedHash, chunkEmbeddings, now)
	if err != nil {
		logger.Error("failed to complete embedding", zap.Error(err))
		return fmt.Errorf("complete embedding: %w", err)
	}
	if !applied {
		logger.Info("embedding skipped: document content advanced since worker snapshot",
			zap.String("expected_hash", expectedHash))
		return errEmbeddingStale
	}

	logger.Info("embedding chunks synced", zap.Int("chunks", len(chunks)))
	return nil
}

// computeEmbeddingHash is a thin alias over dochash.Compute. The embedding
// worker and the document save path must agree on the exact byte layout
// of this fingerprint, so the implementation is shared in
// internal/pkg/dochash.
func computeEmbeddingHash(title, content string) string {
	return dochash.Compute(title, content)
}

// ProcessPendingEmbeddings polls the embedding queue, claims rows with a
// lease, and dispatches them to SyncEmbedding. Rate-limit errors trigger a
// cool-down without consuming the retry budget; other failures consume an
// attempt and schedule the next retry with exponential backoff.
func (s *EmbeddingService) ProcessPendingEmbeddings(ctx context.Context, _ int64) error {
	if s == nil || s.embeddings == nil {
		return nil
	}
	active, err := s.hasActiveV2(ctx)
	if err != nil {
		return err
	}
	if active {
		return nil
	}
	logger := logutil.GetLogger(ctx)
	now := timeutil.NowUnix()
	docs, err := s.embeddings.ListStaleDocuments(ctx, 50, now)
	if err != nil {
		logger.Error("failed to list stale documents", zap.Error(err))
		return fmt.Errorf("list stale documents: %w", err)
	}
	if len(docs) == 0 {
		return nil
	}
	logger.Info("embedding queue scan", zap.Int("candidates", len(docs)))
	claimed := 0
	for _, doc := range docs {
		if err := checkCtx(ctx); err != nil {
			return err
		}
		processed, err := s.processOneEmbedding(ctx, doc)
		if err != nil {
			return err
		}
		if processed {
			claimed++
		}
	}
	logger.Info("embedding queue batch finished", zap.Int("claimed", claimed))
	return nil
}

// processOneEmbedding owns the lifecycle of a single queue entry: claim →
// sync → success or failure bookkeeping. It returns (true, nil) when the
// worker actually held the claim through completion so callers can report
// throughput accurately.
func (s *EmbeddingService) processOneEmbedding(ctx context.Context, doc model.Document) (bool, error) {
	logger := logutil.GetLogger(ctx).With(zap.String("doc_id", doc.ID))
	now := timeutil.NowUnix()
	claimed, err := s.claimEmbedding(ctx, doc, now)
	if err != nil {
		return false, err
	}
	if !claimed {
		return false, nil
	}
	logger.Info("embedding claimed")
	syncErr := s.SyncEmbedding(ctx, doc.UserID, doc.ID, doc.Title, doc.Content)
	if syncErr == nil {
		logger.Info("embedding succeeded")
		return true, waitCtx(ctx, 100*time.Millisecond)
	}
	if errors.Is(syncErr, errEmbeddingStale) {
		// CompleteEmbeddingIfCurrent has already re-pended the row under
		// the current documents.content_hash, so the next stale scan will
		// pick it up cleanly. Treat this as a clean skip: we must not
		// call MarkFailed (it would flip the freshly-pended row back to
		// 'failed' with a backoff and consume a retry attempt for what
		// is, semantically, a normal race resolution).
		logger.Info("embedding skipped: document advanced since worker snapshot")
		return false, waitCtx(ctx, 100*time.Millisecond)
	}
	if isRateLimitErr(syncErr) {
		logger.Warn("embedding provider rate limit triggered, cooling down...", zap.Error(syncErr))
		// Revert the row to its prior eligible state by zeroing the lease
		// without consuming a retry attempt. Use a targeted reset so the
		// row's content_hash / mtime are preserved (UpsertPending would
		// overwrite them with the empty seed values, which then re-fires
		// the drift branch on the next scan).
		if err := s.embeddings.ResetLeaseToPending(ctx, doc.ID); err != nil {
			logger.Error("failed to reset embedding lease after rate limit", zap.Error(err))
		}
		return false, waitCtx(ctx, 10*time.Second)
	}
	attempts := 1
	if existing, err := s.embeddings.GetByDocID(ctx, doc.ID); err == nil {
		attempts = existing.Attempts + 1
	}
	nextRetryAt := now + embeddingBackoffSeconds(attempts)
	errMsg := truncateErr(syncErr.Error())
	if markErr := s.embeddings.MarkFailed(ctx, doc.ID, errMsg, nextRetryAt); markErr != nil {
		logger.Error("failed to record embedding failure", zap.Error(markErr))
	}
	logger.Error("embedding failed",
		zap.Int("attempts", attempts),
		zap.Int64("retry_after", nextRetryAt-now),
		zap.Error(syncErr),
	)
	return true, waitCtx(ctx, 100*time.Millisecond)
}

// claimEmbedding establishes the worker's lease on a single document. The
// happy path tries Claim() to pick up a row already marked pending or
// failed; the drift recovery path tries ClaimDrift() to promote a stale
// succeeded row whose content_hash no longer matches documents. When the
// document has no embedding row yet we seed a pending row first so the
// row-targeted Claim has something to update atomically.
func (s *EmbeddingService) claimEmbedding(ctx context.Context, doc model.Document, now int64) (bool, error) {
	logger := logutil.GetLogger(ctx).With(zap.String("doc_id", doc.ID))
	if _, err := s.embeddings.GetByDocID(ctx, doc.ID); err != nil {
		if !errors.Is(err, appErr.ErrNotFound) {
			return false, fmt.Errorf("get embedding: %w", err)
		}
		// Seed with the real hash so a Claim picked up here proceeds with
		// the same hash SyncEmbedding will compute. Seeding with empty
		// strings would let a concurrent save observe an inconsistent row
		// during the brief window before Claim flips status to running.
		seedHash := computeEmbeddingHash(doc.Title, doc.Content)
		if err := s.embeddings.UpsertPending(ctx, doc.ID, doc.UserID, seedHash, doc.ContentMtime); err != nil {
			return false, fmt.Errorf("seed pending embedding: %w", err)
		}
	}
	ok, err := s.embeddings.Claim(ctx, doc.ID, now+embeddingLeaseSeconds, now)
	if err != nil {
		logger.Warn("failed to claim embedding", zap.Error(err))
		return false, nil
	}
	if ok {
		return true, nil
	}
	// Fall through to drift recovery: the row exists, its status is
	// 'succeeded', but documents.content_hash has moved on. ClaimDrift
	// flips it to 'running' in one statement so two workers cannot race.
	//
	// Pass the documents.content_hash snapshot from ListStaleDocuments.
	// ClaimDrift atomically verifies that it is still current before changing
	// the embedding row, while retaining legacy hash-drift recovery.
	drift, err := s.embeddings.ClaimDrift(ctx, doc.ID, doc.ContentHash, now+embeddingLeaseSeconds, now)
	if err != nil {
		logger.Warn("failed to claim drift embedding", zap.Error(err))
		return false, nil
	}
	return drift, nil
}

func embeddingBackoffSeconds(attempts int) int64 {
	if attempts <= 1 {
		return embeddingBackoffBaseSeconds
	}
	secs := embeddingBackoffBaseSeconds
	for i := 1; i < attempts; i++ {
		secs *= 2
		if secs >= embeddingBackoffMaxSeconds {
			return embeddingBackoffMaxSeconds
		}
	}
	return secs
}

func truncateErr(msg string) string {
	if len(msg) <= embeddingMaxLastErrorChars {
		return msg
	}
	return msg[:embeddingMaxLastErrorChars]
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
