package service

import (
	"context"
	"errors"

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
				return nil, appErr.ErrConflict
			}
		}
		return nil, err
	}
	return tag, nil
}

func (s *TagService) List(ctx context.Context, userID string) ([]model.Tag, error) {
	return s.tags.List(ctx, userID)
}

func (s *TagService) Delete(ctx context.Context, userID, tagID string) error {
	ids, err := s.docTags.ListDocIDsByTag(ctx, userID, tagID)
	if err != nil {
		return err
	}
	if len(ids) > 0 {
		return appErr.ErrConflict
	}
	return s.tags.Delete(ctx, userID, tagID)
}
