package service

import (
	"context"
	"errors"
	"strings"

	sqlite "modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
	"github.com/xxxsen/mnote/internal/repo"
)

type TagService struct {
	tags    *repo.TagRepo
	docTags *repo.DocumentTagRepo
}

func NewTagService(tags *repo.TagRepo, docTags *repo.DocumentTagRepo) *TagService {
	return &TagService{tags: tags, docTags: docTags}
}

func (s *TagService) Create(ctx context.Context, userID, name string) (*model.Tag, error) {
	now := timeutil.NowUnix()
	tag := &model.Tag{
		ID:     newID(),
		UserID: userID,
		Name:   name,
		Ctime:  now,
		Mtime:  now,
	}
	if err := s.tags.Create(ctx, tag); err != nil {
		var sqlErr *sqlite.Error
		if errors.As(err, &sqlErr) {
			if sqlErr.Code() == sqlite3.SQLITE_CONSTRAINT_UNIQUE || sqlErr.Code() == sqlite3.SQLITE_CONSTRAINT {
				items, listErr := s.tags.ListByNames(ctx, userID, []string{name})
				if listErr == nil && len(items) > 0 {
					return &items[0], nil
				}
				return nil, appErr.ErrConflict
			}
		}
		return nil, err
	}
	return tag, nil
}

func (s *TagService) CreateBatch(ctx context.Context, userID string, names []string) ([]model.Tag, error) {
	if len(names) == 0 {
		return []model.Tag{}, nil
	}
	now := timeutil.NowUnix()
	unique := make([]string, 0, len(names))
	seen := make(map[string]bool)
	for _, name := range names {
		trimmed := strings.TrimSpace(name)
		if trimmed == "" {
			continue
		}
		key := strings.ToLower(trimmed)
		if seen[key] {
			continue
		}
		seen[key] = true
		unique = append(unique, trimmed)
	}
	if len(unique) == 0 {
		return []model.Tag{}, nil
	}
	newTags := make([]model.Tag, 0, len(unique))
	for _, name := range unique {
		newTags = append(newTags, model.Tag{
			ID:     newID(),
			UserID: userID,
			Name:   name,
			Ctime:  now,
			Mtime:  now,
		})
	}
	if err := s.tags.CreateBatch(ctx, newTags); err != nil {
		var sqlErr *sqlite.Error
		if errors.As(err, &sqlErr) {
			if sqlErr.Code() == sqlite3.SQLITE_CONSTRAINT_UNIQUE || sqlErr.Code() == sqlite3.SQLITE_CONSTRAINT {
				return nil, appErr.ErrConflict
			}
		}
		return nil, err
	}
	return newTags, nil
}

func (s *TagService) List(ctx context.Context, userID string) ([]model.Tag, error) {
	return s.tags.List(ctx, userID)
}

func (s *TagService) ListPage(ctx context.Context, userID, query string, limit, offset int) ([]model.Tag, error) {
	return s.tags.ListPage(ctx, userID, query, limit, offset)
}

func (s *TagService) ListSummary(ctx context.Context, userID, query string, limit, offset int) ([]model.TagSummary, error) {
	return s.tags.ListSummary(ctx, userID, query, limit, offset)
}

func (s *TagService) ListByNames(ctx context.Context, userID string, names []string) ([]model.Tag, error) {
	return s.tags.ListByNames(ctx, userID, names)
}

func (s *TagService) ListByIDs(ctx context.Context, userID string, ids []string) ([]model.Tag, error) {
	return s.tags.ListByIDs(ctx, userID, ids)
}

func (s *TagService) Delete(ctx context.Context, userID, tagID string) error {
	if err := s.docTags.DeleteByTag(ctx, userID, tagID); err != nil {
		return err
	}
	return s.tags.Delete(ctx, userID, tagID)
}

func (s *TagService) UpdatePinned(ctx context.Context, userID, tagID string, pinned int) error {
	if pinned != 0 && pinned != 1 {
		return appErr.ErrInvalid
	}
	return s.tags.UpdatePinned(ctx, userID, tagID, pinned, timeutil.NowUnix())
}
