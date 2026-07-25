package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/xxxsen/common/logutil"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/ai"
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
var errEmbeddingStale = errors.New("embedding stale: document content advanced before worker finished")

type EmbeddingService struct {
	embedder   ai.IEmbedder
	embeddings embeddingRepo
	chunker    embeddingChunker
}

func NewEmbeddingService(embedder ai.IEmbedder, embeddings embeddingRepo) *EmbeddingService {
	return &EmbeddingService{
		embedder:   embedder,
		embeddings: embeddings,
		chunker:    ai.NewChunker(),
	}
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

	logger.Info("embedding chunks synced", zap.String("title", title), zap.Int("chunks", len(chunks)))
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
