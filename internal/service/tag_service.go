package service

import (
	"context"
	"errors"

	"github.com/mattn/go-sqlite3"

	"mnote/internal/model"
	appErr "mnote/internal/pkg/errors"
	"mnote/internal/pkg/timeutil"
	"mnote/internal/repo"
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
		var sqlErr sqlite3.Error
		if errors.As(err, &sqlErr) && sqlErr.ExtendedCode == sqlite3.ErrConstraintUnique {
			return nil, appErr.ErrConflict
		}
		return nil, err
	}
	return tag, nil
}

func (s *TagService) List(ctx context.Context, userID string) ([]model.Tag, error) {
	return s.tags.List(ctx, userID)
}

func (s *TagService) Delete(ctx context.Context, userID, tagID string) error {
	if err := s.docTags.DeleteByTag(ctx, userID, tagID); err != nil {
		return err
	}
	return s.tags.Delete(ctx, userID, tagID)
}
