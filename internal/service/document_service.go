package service

import (
	"context"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
	"github.com/xxxsen/mnote/internal/repo"
)

type DocumentService struct {
	docs     *repo.DocumentRepo
	versions *repo.VersionRepo
	tags     *repo.DocumentTagRepo
	shares   *repo.ShareRepo
	tagRepo  *repo.TagRepo
	userRepo *repo.UserRepo
}

func NewDocumentService(docs *repo.DocumentRepo, versions *repo.VersionRepo, tags *repo.DocumentTagRepo, shares *repo.ShareRepo, tagRepo *repo.TagRepo, userRepo *repo.UserRepo) *DocumentService {
	return &DocumentService{docs: docs, versions: versions, tags: tags, shares: shares, tagRepo: tagRepo, userRepo: userRepo}
}

type PublicShareDetail struct {
	Document *model.Document `json:"document"`
	Author   string          `json:"author"`
	Tags     []model.Tag     `json:"tags"`
}

type DocumentCreateInput struct {
	Title   string
	Content string
	TagIDs  []string
}

type DocumentUpdateInput struct {
	Title   string
	Content string
	TagIDs  []string
}

func (s *DocumentService) Create(ctx context.Context, userID string, input DocumentCreateInput) (*model.Document, error) {
	now := timeutil.NowUnix()
	doc := &model.Document{
		ID:      newID(),
		UserID:  userID,
		Title:   input.Title,
		Content: input.Content,
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

func (s *DocumentService) UpdatePinned(ctx context.Context, userID, docID string, pinned int) error {
	if pinned != 0 && pinned != 1 {
		return appErr.ErrInvalid
	}
	return s.docs.UpdatePinned(ctx, userID, docID, pinned)
}

func (s *DocumentService) Update(ctx context.Context, userID, docID string, input DocumentUpdateInput) error {
	now := timeutil.NowUnix()
	doc := &model.Document{
		ID:      docID,
		UserID:  userID,
		Title:   input.Title,
		Content: input.Content,
		Mtime:   now,
	}
	if err := s.docs.Update(ctx, doc); err != nil {
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

func (s *DocumentService) Get(ctx context.Context, userID, docID string) (*model.Document, error) {
	return s.docs.GetByID(ctx, userID, docID)
}

func (s *DocumentService) List(ctx context.Context, userID string, limit uint) ([]model.Document, error) {
	return s.docs.List(ctx, userID, limit)
}

func (s *DocumentService) Search(ctx context.Context, userID, query, tagID string, limit uint) ([]model.Document, error) {
	if query == "" && tagID == "" {
		return s.docs.List(ctx, userID, limit)
	}
	return s.docs.SearchLike(ctx, userID, query, tagID, limit)
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

func (s *DocumentService) ListVersions(ctx context.Context, userID, docID string) ([]model.DocumentVersion, error) {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return nil, err
	}
	return s.versions.List(ctx, userID, docID)
}

func (s *DocumentService) GetVersion(ctx context.Context, userID, docID string, version int) (*model.DocumentVersion, error) {
	if _, err := s.docs.GetByID(ctx, userID, docID); err != nil {
		return nil, err
	}
	return s.versions.GetByVersion(ctx, userID, docID, version)
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
