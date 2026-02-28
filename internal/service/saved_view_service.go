package service

import (
	"context"
	"strings"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
	"github.com/xxxsen/mnote/internal/repo"
)

type SavedViewService struct {
	repo *repo.SavedViewRepo
}

func NewSavedViewService(repo *repo.SavedViewRepo) *SavedViewService {
	return &SavedViewService{repo: repo}
}

func (s *SavedViewService) List(ctx context.Context, userID string) ([]model.SavedView, error) {
	return s.repo.List(ctx, userID)
}

type SavedViewCreateInput struct {
	Name        string
	Search      string
	TagID       string
	ShowStarred int
	ShowShared  int
}

func (s *SavedViewService) Create(ctx context.Context, userID string, input SavedViewCreateInput) (*model.SavedView, error) {
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
		return nil, err
	}
	return item, nil
}

func (s *SavedViewService) Delete(ctx context.Context, userID, id string) error {
	if strings.TrimSpace(id) == "" {
		return appErr.ErrInvalid
	}
	return s.repo.Delete(ctx, userID, id)
}
