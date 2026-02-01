package service

import (
	"context"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
	"github.com/xxxsen/mnote/internal/repo"
)

type DocumentService struct {
	docs           *repo.DocumentRepo
	versions       *repo.VersionRepo
	tags           *repo.DocumentTagRepo
	shares         *repo.ShareRepo
	tagRepo        *repo.TagRepo
	userRepo       *repo.UserRepo
	ai             *AIService
	versionMaxKeep int
}

func NewDocumentService(docs *repo.DocumentRepo, versions *repo.VersionRepo, tags *repo.DocumentTagRepo, shares *repo.ShareRepo, tagRepo *repo.TagRepo, userRepo *repo.UserRepo, ai *AIService, versionMaxKeep int) *DocumentService {
	return &DocumentService{docs: docs, versions: versions, tags: tags, shares: shares, tagRepo: tagRepo, userRepo: userRepo, ai: ai, versionMaxKeep: versionMaxKeep}
}

type DocumentSummary struct {
	Recent       []model.Document
	TagCounts    map[string]int
	Total        int
	StarredTotal int
}

type PublicShareDetail struct {
	Document *model.Document `json:"document"`
	Author   string          `json:"author"`
	Tags     []model.Tag     `json:"tags"`
}

func (s *DocumentService) Search(ctx context.Context, userID, query, tagID string, starred *int, limit, offset uint, orderBy string) ([]model.Document, error) {
	if query == "" && tagID == "" {
		return s.docs.List(ctx, userID, starred, limit, offset, orderBy)
	}
	return s.docs.SearchLike(ctx, userID, query, tagID, starred, limit, offset, orderBy)
}

func (s *DocumentService) Get(ctx context.Context, userID, docID string) (*model.Document, error) {
	return s.docs.GetByID(ctx, userID, docID)
}

func (s *DocumentService) UpdateTags(ctx context.Context, userID, docID string, tagIDs []string) error {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return err
	}
	if err := s.tags.DeleteByDoc(ctx, userID, docID); err != nil {
		return err
	}
	for _, tagID := range tagIDs {
		if err := s.tags.Add(ctx, &model.DocumentTag{UserID: userID, DocumentID: docID, TagID: tagID}); err != nil {
			return err
		}
	}
	return nil
}

func (s *DocumentService) UpdateSummary(ctx context.Context, userID, docID, summary string) error {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return err
	}
	now := timeutil.NowUnix()
	return s.docs.UpdateSummary(ctx, userID, docID, summary, now)
}

func (s *DocumentService) UpdatePinned(ctx context.Context, userID, docID string, pinned int) error {
	if pinned != 0 && pinned != 1 {
		return appErr.ErrInvalid
	}
	return s.docs.UpdatePinned(ctx, userID, docID, pinned)
}

func (s *DocumentService) UpdateStarred(ctx context.Context, userID, docID string, starred int) error {
	if starred != 0 && starred != 1 {
		return appErr.ErrInvalid
	}
	return s.docs.UpdateStarred(ctx, userID, docID, starred)
}

func (s *DocumentService) ListSharedDocuments(ctx context.Context, userID string, query string) ([]SharedDocumentSummary, error) {
	items, err := s.shares.ListActiveDocuments(ctx, userID, query)
	if err != nil {
		return nil, err
	}
	docIDs := make([]string, 0, len(items))
	for _, item := range items {
		docIDs = append(docIDs, item.ID)
	}
	tagIDsByDoc, err := s.tags.ListTagIDsByDocIDs(ctx, userID, docIDs)
	if err != nil {
		return nil, err
	}
	results := make([]SharedDocumentSummary, 0, len(items))
	for _, item := range items {
		results = append(results, SharedDocumentSummary{
			ID:      item.ID,
			Title:   item.Title,
			Summary: item.Summary,
			Mtime:   item.Mtime,
			Token:   item.Token,
			TagIDs:  tagIDsByDoc[item.ID],
		})
	}
	return results, nil
}

func (s *DocumentService) GetByTitle(ctx context.Context, userID, title string) (*model.Document, error) {
	return s.docs.GetByTitle(ctx, userID, title)
}

func (s *DocumentService) ListByIDs(ctx context.Context, userID string, docIDs []string) ([]model.Document, error) {
	return s.docs.ListByIDs(ctx, userID, docIDs)
}

func (s *DocumentService) Summary(ctx context.Context, userID string, recentLimit uint) (*DocumentSummary, error) {

	recent, err := s.docs.List(ctx, userID, nil, recentLimit, 0, "mtime desc")
	if err != nil {
		return nil, err
	}
	items, err := s.tags.ListByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	counts := make(map[string]int)
	for _, item := range items {
		counts[item.TagID]++
	}
	count, err := s.docs.Count(ctx, userID, nil)
	if err != nil {
		return nil, err
	}
	starredVal := 1
	starredCount, err := s.docs.Count(ctx, userID, &starredVal)
	if err != nil {
		return nil, err
	}
	return &DocumentSummary{Recent: recent, TagCounts: counts, Total: count, StarredTotal: starredCount}, nil
}

func (s *DocumentService) ListByTag(ctx context.Context, userID, tagID string) ([]model.Document, error) {
	ids, err := s.tags.ListDocIDsByTag(ctx, userID, tagID)
	if err != nil {
		return nil, err
	}
	return s.docs.ListByIDs(ctx, userID, ids)
}

func (s *DocumentService) ListTagIDs(ctx context.Context, userID, docID string) ([]string, error) {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return nil, err
	}
	return s.tags.ListTagIDs(ctx, userID, docID)
}

func (s *DocumentService) ListTagIDsByDocIDs(ctx context.Context, userID string, docIDs []string) (map[string][]string, error) {
	return s.tags.ListTagIDsByDocIDs(ctx, userID, docIDs)
}

func (s *DocumentService) ListTagsByIDs(ctx context.Context, userID string, ids []string) ([]model.Tag, error) {
	return s.tagRepo.ListByIDs(ctx, userID, ids)
}

func (s *DocumentService) Delete(ctx context.Context, userID, docID string) error {
	now := timeutil.NowUnix()
	if err := s.docs.Delete(ctx, userID, docID, now); err != nil {
		return err
	}
	if err := s.shares.RevokeByDocument(ctx, userID, docID, now); err != nil {
		return err
	}
	if err := s.tags.DeleteByDoc(ctx, userID, docID); err != nil {
		return err
	}
	return nil
}

func (s *DocumentService) ListVersions(ctx context.Context, userID, docID string) ([]model.DocumentVersionSummary, error) {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return nil, err
	}
	return s.versions.ListSummaries(ctx, userID, docID)
}

func (s *DocumentService) GetVersion(ctx context.Context, userID, docID string, version int) (*model.DocumentVersion, error) {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return nil, err
	}
	return s.versions.GetByVersion(ctx, userID, docID, version)
}

func (s *DocumentService) pruneVersions(ctx context.Context, userID, docID string) error {
	if s.versionMaxKeep <= 0 {
		return nil
	}
	return s.versions.DeleteOldVersions(ctx, userID, docID, s.versionMaxKeep)
}

func (s *DocumentService) CreateShare(ctx context.Context, userID, docID string) (*model.Share, error) {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return nil, err
	}
	now := timeutil.NowUnix()
	if err := s.shares.RevokeByDocument(ctx, userID, docID, now); err != nil {
		return nil, err
	}
	share := &model.Share{
		ID:         newID(),
		UserID:     userID,
		DocumentID: docID,
		Token:      newToken(),
		State:      repo.ShareStateActive,
		Ctime:      now,
		Mtime:      now,
	}
	if err := s.shares.Create(ctx, share); err != nil {
		return nil, err
	}
	return share, nil
}

func (s *DocumentService) RevokeShare(ctx context.Context, userID, docID string) error {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return err
	}
	return s.shares.RevokeByDocument(ctx, userID, docID, timeutil.NowUnix())
}

func (s *DocumentService) GetActiveShare(ctx context.Context, userID, docID string) (*model.Share, error) {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return nil, err
	}
	share, err := s.shares.GetActiveByDocument(ctx, userID, docID)
	if err == appErr.ErrNotFound {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return share, nil
}

func (s *DocumentService) GetShareByToken(ctx context.Context, token string) (*PublicShareDetail, error) {
	share, err := s.shares.GetByToken(ctx, token)
	if err != nil {
		return nil, err
	}
	if share.State != repo.ShareStateActive {
		return nil, appErr.ErrNotFound
	}
	doc, err := s.docs.GetByID(ctx, share.UserID, share.DocumentID)
	if err != nil {
		return nil, err
	}
	user, err := s.userRepo.GetByID(ctx, share.UserID)
	if err != nil {
		return nil, err
	}
	tagIDs, err := s.tags.ListTagIDs(ctx, share.UserID, share.DocumentID)
	if err != nil {
		return nil, err
	}
	tags, err := s.tagRepo.ListByIDs(ctx, share.UserID, tagIDs)
	if err != nil {
		return nil, err
	}
	return &PublicShareDetail{
		Document: doc,
		Author:   user.Email,
		Tags:     tags,
	}, nil
}

type SharedDocumentSummary struct {
	ID      string   `json:"id"`
	Title   string   `json:"title"`
	Summary string   `json:"summary"`
	Mtime   int64    `json:"mtime"`
	Token   string   `json:"token"`
	TagIDs  []string `json:"tag_ids"`
}

type DocumentCreateInput struct {
	Title   string
	Content string
	TagIDs  []string
	Summary string
}

type DocumentUpdateInput struct {
	Title   string
	Content string
	TagIDs  []string
	Summary *string
}

func (s *DocumentService) Update(ctx context.Context, userID, docID string, input DocumentUpdateInput) error {
	now := timeutil.NowUnix()
	doc := &model.Document{
		ID:      docID,
		UserID:  userID,
		Title:   input.Title,
		Content: input.Content,
		Summary: "",
		Mtime:   now,
	}
	updateSummary := input.Summary != nil
	if updateSummary {
		doc.Summary = *input.Summary
	}
	if err := s.docs.Update(ctx, doc, updateSummary); err != nil {
		return err
	}

	versionNumber := 1
	if latest, err := s.versions.GetLatestVersion(ctx, userID, docID); err == nil {
		versionNumber = latest + 1
	}
	version := &model.DocumentVersion{
		ID:         newID(),
		UserID:     userID,
		DocumentID: docID,
		Version:    versionNumber,
		Title:      input.Title,
		Content:    input.Content,
		Ctime:      now,
	}
	if err := s.versions.Create(ctx, version); err != nil {
		return err
	}
	if err := s.pruneVersions(ctx, userID, docID); err != nil {
		return err
	}
	if input.TagIDs != nil {
		if err := s.tags.DeleteByDoc(ctx, userID, docID); err != nil {
			return err
		}
		for _, tagID := range input.TagIDs {
			if err := s.tags.Add(ctx, &model.DocumentTag{UserID: userID, DocumentID: docID, TagID: tagID}); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *DocumentService) Create(ctx context.Context, userID string, input DocumentCreateInput) (*model.Document, error) {
	now := timeutil.NowUnix()
	doc := &model.Document{
		ID:      newID(),
		UserID:  userID,
		Title:   input.Title,
		Content: input.Content,
		Summary: input.Summary,
		State:   repo.DocumentStateNormal,
		Pinned:  0,
		Ctime:   now,
		Mtime:   now,
	}
	if err := s.docs.Create(ctx, doc); err != nil {
		return nil, err
	}

	version := &model.DocumentVersion{
		ID:         newID(),
		UserID:     userID,
		DocumentID: doc.ID,
		Version:    1,
		Title:      doc.Title,
		Content:    doc.Content,
		Ctime:      now,
	}
	if err := s.versions.Create(ctx, version); err != nil {
		return nil, err
	}
	if err := s.pruneVersions(ctx, userID, doc.ID); err != nil {
		return nil, err
	}
	if input.TagIDs != nil {
		if err := s.tags.DeleteByDoc(ctx, userID, doc.ID); err != nil {
			return nil, err
		}
		for _, tagID := range input.TagIDs {
			if err := s.tags.Add(ctx, &model.DocumentTag{UserID: userID, DocumentID: doc.ID, TagID: tagID}); err != nil {
				return nil, err
			}
		}
	}
	return doc, nil
}
