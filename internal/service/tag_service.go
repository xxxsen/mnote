package service

import (
	"context"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
)

type TagService struct {
	transactor Transactor
	tags       tagRepo
	docTags    documentTagRepo
	runtime    Runtime
}

func NewTagService(
	runtime Runtime, tags tagRepo, docTags documentTagRepo,
) *TagService {
	runtime = prepareRuntime(runtime)
	return &TagService{
		transactor: runtime.Transactor, tags: tags, docTags: docTags,
		runtime: runtime,
	}
}

func (s *TagService) runInTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if err := s.transactor.WithinTransaction(ctx, fn); err != nil {
		return fmt.Errorf("run in tx: %w", err)
	}
	return nil
}

func (s *TagService) Create(ctx context.Context, userID, name string) (*model.Tag, error) {
	name = strings.TrimSpace(name)
	if name == "" || utf8.RuneCountInString(name) > 64 {
		return nil, appErr.ErrInvalid
	}
	id, err := s.runtime.IDs.ID()
	if err != nil {
		return nil, fmt.Errorf("generate tag id: %w", err)
	}
	now := timeutil.NowUnix()
	tag := &model.Tag{
		ID:     id,
		UserID: userID,
		Name:   name,
		Ctime:  now,
		Mtime:  now,
	}
	if err := s.tags.Create(ctx, tag); err != nil {
		if appErr.IsConflict(err) {
			items, listErr := s.tags.ListByNames(ctx, userID, []string{name})
			if listErr == nil && len(items) > 0 {
				return &items[0], nil
			}
			return nil, appErr.ErrConflict
		}
		return nil, fmt.Errorf("create tag: %w", err)
	}
	return tag, nil
}

func (s *TagService) CreateBatch(ctx context.Context, userID string, names []string) ([]model.Tag, error) {
	if len(names) == 0 {
		return []model.Tag{}, nil
	}
	if len(names) > 100 {
		return nil, appErr.ErrInvalid
	}
	now := timeutil.NowUnix()
	unique := make([]string, 0, len(names))
	seen := make(map[string]bool)
	for _, name := range names {
		trimmed := strings.TrimSpace(name)
		if trimmed == "" {
			continue
		}
		if utf8.RuneCountInString(trimmed) > 64 {
			return nil, appErr.ErrInvalid
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
		id, err := s.runtime.IDs.ID()
		if err != nil {
			return nil, fmt.Errorf("generate tag id: %w", err)
		}
		newTags = append(newTags, model.Tag{
			ID:     id,
			UserID: userID,
			Name:   name,
			Ctime:  now,
			Mtime:  now,
		})
	}
	if err := s.tags.CreateBatch(ctx, newTags); err != nil {
		if appErr.IsConflict(err) {
			return nil, appErr.ErrConflict
		}
		return nil, fmt.Errorf("batch insert tags: %w", err)
	}
	return newTags, nil
}

func (s *TagService) List(ctx context.Context, userID string) ([]model.Tag, error) {
	v0, err := s.tags.List(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list: %w", err)
	}
	return v0, nil
}

func (s *TagService) ListPage(ctx context.Context, userID, query string, limit, offset int) ([]model.Tag, error) {
	if len([]rune(query)) > 200 {
		return nil, appErr.ErrInvalid
	}
	page := Page{Limit: limit, Offset: offset}.Clamp(20, 100)
	v0, err := s.tags.ListPage(ctx, userID, query, page.Limit, page.Offset)
	if err != nil {
		return nil, fmt.Errorf("list page: %w", err)
	}
	return v0, nil
}

func (
	s *TagService) ListSummary(ctx context.Context,
	userID,
	query string,
	limit,
	offset int) ([]model.TagSummary,
	error,
) {
	if len([]rune(query)) > 200 {
		return nil, appErr.ErrInvalid
	}
	page := Page{Limit: limit, Offset: offset}.Clamp(20, 100)
	v0, err := s.tags.ListSummary(ctx, userID, query, page.Limit, page.Offset)
	if err != nil {
		return nil, fmt.Errorf("list summary: %w", err)
	}
	return v0, nil
}

func (s *TagService) ListByNames(ctx context.Context, userID string, names []string) ([]model.Tag, error) {
	if len(names) > 100 {
		return nil, appErr.ErrInvalid
	}
	v0, err := s.tags.ListByNames(ctx, userID, names)
	if err != nil {
		return nil, fmt.Errorf("list by names: %w", err)
	}
	return v0, nil
}

func (s *TagService) ListByIDs(ctx context.Context, userID string, ids []string) ([]model.Tag, error) {
	if len(ids) > 200 {
		return nil, appErr.ErrInvalid
	}
	v0, err := s.tags.ListByIDs(ctx, userID, ids)
	if err != nil {
		return nil, fmt.Errorf("list by ids: %w", err)
	}
	return v0, nil
}

func (s *TagService) Delete(ctx context.Context, userID, tagID string) error {
	return s.runInTx(ctx, func(txCtx context.Context) error {
		if err := s.docTags.DeleteByTag(txCtx, userID, tagID); err != nil {
			return fmt.Errorf("delete by tag: %w", err)
		}
		if err := s.tags.Delete(txCtx, userID, tagID); err != nil {
			return fmt.Errorf("delete: %w", err)
		}
		return nil
	})
}

func (s *TagService) UpdatePinned(ctx context.Context, userID, tagID string, pinned int) error {
	if pinned != 0 && pinned != 1 {
		return appErr.ErrInvalid
	}
	if err := s.tags.UpdatePinned(ctx, userID, tagID, pinned, timeutil.NowUnix()); err != nil {
		return fmt.Errorf("update pinned: %w", err)
	}
	return nil
}
