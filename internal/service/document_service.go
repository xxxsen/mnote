package service

import (
	"context"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/safeconv"
)

// documentAssetSyncer is the narrow surface DocumentService needs from
// AssetService. Defining it locally lets tests substitute a stub without
// constructing a full AssetService and lets refreshReferences exercise its
// failure branches (the concrete *AssetService can satisfy it directly).
type documentAssetSyncer interface {
	SyncDocumentReferences(ctx context.Context, userID, docID, content string) error
	RemoveDocumentReferences(ctx context.Context, userID, docID string) error
}

// documentEmbeddingClient is the surface DocumentService needs from
// EmbeddingService. It covers save-time bookkeeping and semantic search.
type documentEmbeddingClient interface {
	MarkEmbeddingPending(ctx context.Context, userID, docID, contentHash string, now int64) error
	SemanticSearch(
		ctx context.Context, userID, query string, topK int, excludeID string,
	) ([]string, []float32, error)
}

type DocumentService struct {
	transactor     Transactor
	docs           documentRepo
	versions       versionRepo
	tags           documentTagRepo
	shares         shareRepo
	tagRepo        tagRepo
	userRepo       userRepo
	embedding      documentEmbeddingClient
	assets         documentAssetSyncer
	versionMaxKeep int
	runtime        Runtime
}

const (
	semanticSearchMinScore = 0.7
)

func NewDocumentService(
	runtime Runtime,
	docs documentRepo,
	versions versionRepo,
	tags documentTagRepo,
	shares shareRepo,
	tagRepo tagRepo,
	userRepo userRepo,
	embedding documentEmbeddingClient,
	versionMaxKeep int,
	assets documentAssetSyncer,
) *DocumentService {
	runtime = prepareRuntime(runtime)
	svc := &DocumentService{
		transactor: runtime.Transactor,
		docs:       docs, versions: versions,
		tags: tags, shares: shares, tagRepo: tagRepo, userRepo: userRepo,
		versionMaxKeep: versionMaxKeep,
		runtime:        runtime,
		embedding:      embedding,
		assets:         assets,
	}
	return svc
}

func (s *DocumentService) now() int64 {
	return s.runtime.Clock.Now().Unix()
}

func (s *DocumentService) runInTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if err := s.transactor.WithinTransaction(ctx, fn); err != nil {
		return fmt.Errorf("run in tx: %w", err)
	}
	return nil
}

func (
	s *DocumentService) Search(ctx context.Context,
	userID,
	query,
	tagID string,
	starred *int,
	limit,
	offset uint,
	orderBy string) ([]model.Document,
	error,
) {
	query = strings.TrimSpace(query)
	if utf8.RuneCountInString(query) > 200 {
		return nil, appErr.ErrInvalid
	}
	page := Page{Limit: safeconv.UintToInt(limit), Offset: safeconv.UintToInt(offset)}.
		Clamp(50, 200)
	limit = safeconv.IntToUint(page.Limit)
	offset = safeconv.IntToUint(page.Offset)
	if query == "" && tagID == "" {
		docs, err := s.docs.List(ctx, userID, starred, limit, offset, orderBy)
		if err != nil {
			return nil, fmt.Errorf("list documents: %w", err)
		}
		return docs, nil
	}
	docs, err := s.docs.SearchLike(ctx, userID, query, tagID, starred, limit, offset, orderBy)
	if err != nil {
		return nil, fmt.Errorf("search documents: %w", err)
	}
	return docs, nil
}

func (s *DocumentService) SemanticSearch(
	ctx context.Context,
	userID, query, _ string,
	_ *int,
	limit, offset uint,
	_, excludeID string,
) ([]model.Document, []float32, error) {
	query = strings.TrimSpace(query)
	if utf8.RuneCountInString(query) > 200 {
		return nil, nil, appErr.ErrInvalid
	}
	if query == "" || s.embedding == nil {
		return []model.Document{}, []float32{}, nil
	}
	topN := safeconv.UintToInt(limit + offset)
	ids, scores, err := s.embedding.SemanticSearch(ctx, userID, query, topN, excludeID)
	if err != nil {
		return nil, nil, fmt.Errorf("semantic search: %w", err)
	}
	if len(ids) == 0 {
		return []model.Document{}, []float32{}, nil
	}

	docs, err := s.docs.ListByIDs(ctx, userID, ids)
	if err != nil {
		return nil, nil, fmt.Errorf("list documents by ids: %w", err)
	}
	idMap := make(map[string]model.Document)
	for _, d := range docs {
		idMap[d.ID] = d
	}
	sortedDocs := make([]model.Document, 0, len(ids))
	sortedScores := make([]float32, 0, len(ids))
	for i, id := range ids {
		if d, ok := idMap[id]; ok {
			if scores[i] < semanticSearchMinScore {
				continue
			}
			sortedDocs = append(sortedDocs, d)
			sortedScores = append(sortedScores, scores[i])
		}
	}
	off := safeconv.UintToInt(offset)
	lim := safeconv.UintToInt(limit)
	if off < len(sortedDocs) {
		end := off + lim
		if end > len(sortedDocs) || lim == 0 {
			end = len(sortedDocs)
		}
		return sortedDocs[off:end], sortedScores[off:end], nil
	}
	return []model.Document{}, []float32{}, nil
}

func (s *DocumentService) Get(ctx context.Context, userID, docID string) (*model.Document, error) {
	doc, err := s.docs.GetByID(ctx, userID, docID)
	if err != nil {
		return nil, fmt.Errorf("get by id: %w", err)
	}
	return doc, nil
}

func (s *DocumentService) GetByTitle(ctx context.Context, userID, title string) (*model.Document, error) {
	doc, err := s.docs.GetByTitle(ctx, userID, title)
	if err != nil {
		return nil, fmt.Errorf("get by title: %w", err)
	}
	return doc, nil
}

func (s *DocumentService) ListByIDs(ctx context.Context, userID string, docIDs []string) ([]model.Document, error) {
	if len(docIDs) > 200 {
		return nil, appErr.ErrInvalid
	}
	docs, err := s.docs.ListByIDs(ctx, userID, docIDs)
	if err != nil {
		return nil, fmt.Errorf("list by ids: %w", err)
	}
	return docs, nil
}

func (s *DocumentService) ListByTag(ctx context.Context, userID, tagID string) ([]model.Document, error) {
	ids, err := s.tags.ListDocIDsByTag(ctx, userID, tagID)
	if err != nil {
		return nil, fmt.Errorf("list doc ids by tag: %w", err)
	}
	v0, err := s.docs.ListByIDs(ctx, userID, ids)
	if err != nil {
		return nil, fmt.Errorf("list by ids: %w", err)
	}
	return v0, nil
}

func (s *DocumentService) ListTagIDs(ctx context.Context, userID, docID string) ([]string, error) {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return nil, fmt.Errorf("get by id: %w", err)
	}
	v0, err := s.tags.ListTagIDs(ctx, userID, docID)
	if err != nil {
		return nil, fmt.Errorf("list tag ids: %w", err)
	}
	return v0, nil
}

func (
	s *DocumentService) ListTagIDsByDocIDs(ctx context.Context,
	userID string,
	docIDs []string) (map[string][]string,
	error,
) {
	v0, err := s.tags.ListTagIDsByDocIDs(ctx, userID, docIDs)
	if err != nil {
		return nil, fmt.Errorf("list tag ids by doc ids: %w", err)
	}
	return v0, nil
}

func (s *DocumentService) ListTagsByIDs(ctx context.Context, userID string, ids []string) ([]model.Tag, error) {
	v0, err := s.tagRepo.ListByIDs(ctx, userID, ids)
	if err != nil {
		return nil, fmt.Errorf("list by ids: %w", err)
	}
	return v0, nil
}

func (s *DocumentService) GetBacklinks(ctx context.Context, userID, docID string) ([]model.Document, error) {
	docs, err := s.docs.GetBacklinks(ctx, userID, docID)
	if err != nil {
		return nil, fmt.Errorf("get backlinks: %w", err)
	}
	return docs, nil
}
