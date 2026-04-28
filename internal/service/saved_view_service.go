package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
)

type SavedViewService struct {
	repo savedViewRepo
}

func NewSavedViewService(repo savedViewRepo) *SavedViewService {
	return &SavedViewService{repo: repo}
}

func (s *SavedViewService) List(ctx context.Context, userID string) ([]model.SavedView, error) {
	v0, err := s.repo.List(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("list: %w", err)
	}
	return v0, nil
}

type SavedViewCreateInput struct {
	Name        string
	Search      string
	TagID       string
	ShowStarred int
	ShowShared  int
}

func (
	s *SavedViewService) Create(ctx context.Context,
	userID string,
	input SavedViewCreateInput) (*model.SavedView,
	error,
) {
	name := strings.TrimSpace(input.Name)
	if name == "" || len([]rune(name)) > 32 {
		return nil, appErr.ErrInvalid
	}
	if input.ShowStarred != 0 && input.ShowStarred != 1 {
		return nil, appErr.ErrInvalid
	}
	if input.ShowShared != 0 && input.ShowShared != 1 {
		return nil, appErr.ErrInvalid
	}
	now := timeutil.NowUnix()
	item := &model.SavedView{
		ID:          newID(),
		UserID:      userID,
		Name:        name,
		Search:      strings.TrimSpace(input.Search),
		TagID:       strings.TrimSpace(input.TagID),
		ShowStarred: input.ShowStarred,
		ShowShared:  input.ShowShared,
		Ctime:       now,
		Mtime:       now,
	}
	if err := s.repo.Create(ctx, item); err != nil {
		return nil, fmt.Errorf("create saved view: %w", err)
	}
	return item, nil
}

func (s *SavedViewService) Delete(ctx context.Context, userID, id string) error {
	if strings.TrimSpace(id) == "" {
		return appErr.ErrInvalid
	}
	if err := s.repo.Delete(ctx, userID, id); err != nil {
		return fmt.Errorf("delete: %w", err)
	}
	return nil
}
