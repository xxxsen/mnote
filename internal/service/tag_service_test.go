package service

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

type mockTagRepo struct {
	createFn       func(ctx context.Context, tag *model.Tag) error
	createBatchFn  func(ctx context.Context, tags []model.Tag) error
	listFn         func(ctx context.Context, userID string) ([]model.Tag, error)
	listPageFn     func(ctx context.Context, userID, query string, limit, offset int) ([]model.Tag, error)
	listSummaryFn  func(ctx context.Context, userID, query string, limit, offset int) ([]model.TagSummary, error)
	listByNamesFn  func(ctx context.Context, userID string, names []string) ([]model.Tag, error)
	listByIDsFn    func(ctx context.Context, userID string, ids []string) ([]model.Tag, error)
	updatePinnedFn func(ctx context.Context, userID, tagID string, pinned int, mtime int64) error
	deleteFn       func(ctx context.Context, userID, tagID string) error
}

func (m *mockTagRepo) Create(ctx context.Context, tag *model.Tag) error { return m.createFn(ctx, tag) }
func (m *mockTagRepo) CreateBatch(ctx context.Context, tags []model.Tag) error {
	return m.createBatchFn(ctx, tags)
}

func (m *mockTagRepo) List(ctx context.Context, userID string) ([]model.Tag, error) {
	return m.listFn(ctx, userID)
}

func (m *mockTagRepo) ListPage(ctx context.Context, userID, query string, limit, offset int) ([]model.Tag, error) {
	return m.listPageFn(ctx, userID, query, limit, offset)
}

func (m *mockTagRepo) ListSummary(ctx context.Context, userID, query string, limit, offset int) ([]model.TagSummary, error) {
	return m.listSummaryFn(ctx, userID, query, limit, offset)
}

func (m *mockTagRepo) ListByNames(ctx context.Context, userID string, names []string) ([]model.Tag, error) {
	return m.listByNamesFn(ctx, userID, names)
}

func (m *mockTagRepo) ListByIDs(ctx context.Context, userID string, ids []string) ([]model.Tag, error) {
	return m.listByIDsFn(ctx, userID, ids)
}

func (m *mockTagRepo) UpdatePinned(ctx context.Context, userID, tagID string, pinned int, mtime int64) error {
	return m.updatePinnedFn(ctx, userID, tagID, pinned, mtime)
}

func (m *mockTagRepo) Delete(ctx context.Context, userID, tagID string) error {
	return m.deleteFn(ctx, userID, tagID)
}

type mockDocumentTagRepo struct {
	addFn                func(ctx context.Context, docTag *model.DocumentTag) error
	deleteByDocFn        func(ctx context.Context, userID, docID string) error
	deleteByTagFn        func(ctx context.Context, userID, tagID string) error
	listTagIDsFn         func(ctx context.Context, userID, docID string) ([]string, error)
	listDocIDsByTagFn    func(ctx context.Context, userID, tagID string) ([]string, error)
	listByUserFn         func(ctx context.Context, userID string) ([]model.DocumentTag, error)
	listTagIDsByDocIDsFn func(ctx context.Context, userID string, docIDs []string) (map[string][]string, error)
}

func (m *mockDocumentTagRepo) Add(ctx context.Context, docTag *model.DocumentTag) error {
	return m.addFn(ctx, docTag)
}

func (m *mockDocumentTagRepo) DeleteByDoc(ctx context.Context, userID, docID string) error {
	return m.deleteByDocFn(ctx, userID, docID)
}

func (m *mockDocumentTagRepo) DeleteByTag(ctx context.Context, userID, tagID string) error {
	return m.deleteByTagFn(ctx, userID, tagID)
}

func (m *mockDocumentTagRepo) ListTagIDs(ctx context.Context, userID, docID string) ([]string, error) {
	return m.listTagIDsFn(ctx, userID, docID)
}

func (m *mockDocumentTagRepo) ListDocIDsByTag(ctx context.Context, userID, tagID string) ([]string, error) {
	return m.listDocIDsByTagFn(ctx, userID, tagID)
}

func (m *mockDocumentTagRepo) ListByUser(ctx context.Context, userID string) ([]model.DocumentTag, error) {
	return m.listByUserFn(ctx, userID)
}

func (m *mockDocumentTagRepo) ListTagIDsByDocIDs(ctx context.Context, userID string, docIDs []string) (map[string][]string, error) {
	return m.listTagIDsByDocIDsFn(ctx, userID, docIDs)
}

func TestTagService_Create(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		tags := &mockTagRepo{
			createFn: func(_ context.Context, tag *model.Tag) error {
				assert.Equal(t, "u1", tag.UserID)
				assert.Equal(t, "golang", tag.Name)
				return nil
			},
		}
		svc := NewTagService(nil, tags, &mockDocumentTagRepo{})
		tag, err := svc.Create(context.Background(), "u1", "golang")
		require.NoError(t, err)
		assert.Equal(t, "golang", tag.Name)
		assert.NotEmpty(t, tag.ID)
	})

	t.Run("conflict_returns_existing", func(t *testing.T) {
		tags := &mockTagRepo{
			createFn: func(context.Context, *model.Tag) error {
				return appErr.ErrConflict
			},
			listByNamesFn: func(_ context.Context, _ string, names []string) ([]model.Tag, error) {
				return []model.Tag{{ID: "existing-id", Name: names[0]}}, nil
			},
		}
		svc := NewTagService(nil, tags, &mockDocumentTagRepo{})
		tag, err := svc.Create(context.Background(), "u1", "golang")
		require.NoError(t, err)
		assert.Equal(t, "existing-id", tag.ID)
	})

	t.Run("conflict_no_existing", func(t *testing.T) {
		tags := &mockTagRepo{
			createFn: func(context.Context, *model.Tag) error {
				return appErr.ErrConflict
			},
			listByNamesFn: func(context.Context, string, []string) ([]model.Tag, error) {
				return nil, nil
			},
		}
		svc := NewTagService(nil, tags, &mockDocumentTagRepo{})
		_, err := svc.Create(context.Background(), "u1", "golang")
		assert.ErrorIs(t, err, appErr.ErrConflict)
	})

	t.Run("repo_error", func(t *testing.T) {
		tags := &mockTagRepo{
			createFn: func(context.Context, *model.Tag) error {
				return errors.New("db error")
			},
		}
		svc := NewTagService(nil, tags, &mockDocumentTagRepo{})
		_, err := svc.Create(context.Background(), "u1", "golang")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "create tag")
	})
}

func TestTagService_CreateBatch(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		tags := &mockTagRepo{
			createBatchFn: func(_ context.Context, tags []model.Tag) error {
				assert.Len(t, tags, 2)
				return nil
			},
		}
		svc := NewTagService(nil, tags, &mockDocumentTagRepo{})
		result, err := svc.CreateBatch(context.Background(), "u1", []string{"go", "rust"})
		require.NoError(t, err)
		assert.Len(t, result, 2)
	})

	t.Run("empty_names", func(t *testing.T) {
		svc := NewTagService(nil, &mockTagRepo{}, &mockDocumentTagRepo{})
		result, err := svc.CreateBatch(context.Background(), "u1", nil)
		require.NoError(t, err)
		assert.Empty(t, result)
	})

	t.Run("dedup", func(t *testing.T) {
		tags := &mockTagRepo{
			createBatchFn: func(_ context.Context, tags []model.Tag) error {
				assert.Len(t, tags, 1)
				return nil
			},
		}
		svc := NewTagService(nil, tags, &mockDocumentTagRepo{})
		result, err := svc.CreateBatch(context.Background(), "u1", []string{"Go", "go", " go "})
		require.NoError(t, err)
		assert.Len(t, result, 1)
	})

	t.Run("all_blank", func(t *testing.T) {
		svc := NewTagService(nil, &mockTagRepo{}, &mockDocumentTagRepo{})
		result, err := svc.CreateBatch(context.Background(), "u1", []string{"", " ", "  "})
		require.NoError(t, err)
		assert.Empty(t, result)
	})

	t.Run("conflict", func(t *testing.T) {
		tags := &mockTagRepo{
			createBatchFn: func(context.Context, []model.Tag) error {
				return appErr.ErrConflict
			},
		}
		svc := NewTagService(nil, tags, &mockDocumentTagRepo{})
		_, err := svc.CreateBatch(context.Background(), "u1", []string{"go"})
		assert.ErrorIs(t, err, appErr.ErrConflict)
	})

	t.Run("repo_error", func(t *testing.T) {
		tags := &mockTagRepo{
			createBatchFn: func(context.Context, []model.Tag) error {
				return errors.New("db error")
			},
		}
		svc := NewTagService(nil, tags, &mockDocumentTagRepo{})
		_, err := svc.CreateBatch(context.Background(), "u1", []string{"go"})
		assert.Error(t, err)
	})
}

func TestTagService_List(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		tags := &mockTagRepo{
			listFn: func(context.Context, string) ([]model.Tag, error) {
				return []model.Tag{{ID: "t1", Name: "go"}}, nil
			},
		}
		svc := NewTagService(nil, tags, &mockDocumentTagRepo{})
		result, err := svc.List(context.Background(), "u1")
		require.NoError(t, err)
		assert.Len(t, result, 1)
	})

	t.Run("error", func(t *testing.T) {
		tags := &mockTagRepo{
			listFn: func(context.Context, string) ([]model.Tag, error) {
				return nil, errors.New("db error")
			},
		}
		svc := NewTagService(nil, tags, &mockDocumentTagRepo{})
		_, err := svc.List(context.Background(), "u1")
		assert.Error(t, err)
	})
}

func TestTagService_ListPage(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		tags := &mockTagRepo{
			listPageFn: func(_ context.Context, _, query string, limit, offset int) ([]model.Tag, error) {
				assert.Equal(t, "go", query)
				assert.Equal(t, 10, limit)
				assert.Equal(t, 0, offset)
				return []model.Tag{{Name: "golang"}}, nil
			},
		}
		svc := NewTagService(nil, tags, &mockDocumentTagRepo{})
		result, err := svc.ListPage(context.Background(), "u1", "go", 10, 0)
		require.NoError(t, err)
		assert.Len(t, result, 1)
	})

	t.Run("error", func(t *testing.T) {
		tags := &mockTagRepo{
			listPageFn: func(context.Context, string, string, int, int) ([]model.Tag, error) {
				return nil, errors.New("db error")
			},
		}
		svc := NewTagService(nil, tags, &mockDocumentTagRepo{})
		_, err := svc.ListPage(context.Background(), "u1", "", 10, 0)
		assert.Error(t, err)
	})
}

func TestTagService_ListSummary(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		tags := &mockTagRepo{
			listSummaryFn: func(context.Context, string, string, int, int) ([]model.TagSummary, error) {
				return []model.TagSummary{{Name: "go", Count: 5}}, nil
			},
		}
		svc := NewTagService(nil, tags, &mockDocumentTagRepo{})
		result, err := svc.ListSummary(context.Background(), "u1", "", 10, 0)
		require.NoError(t, err)
		assert.Len(t, result, 1)
		assert.Equal(t, 5, result[0].Count)
	})

	t.Run("error", func(t *testing.T) {
		tags := &mockTagRepo{
			listSummaryFn: func(context.Context, string, string, int, int) ([]model.TagSummary, error) {
				return nil, errors.New("db error")
			},
		}
		svc := NewTagService(nil, tags, &mockDocumentTagRepo{})
		_, err := svc.ListSummary(context.Background(), "u1", "", 10, 0)
		assert.Error(t, err)
	})
}

func TestTagService_ListByNames(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		tags := &mockTagRepo{
			listByNamesFn: func(_ context.Context, _ string, names []string) ([]model.Tag, error) {
				assert.Equal(t, []string{"go", "rust"}, names)
				return []model.Tag{{Name: "go"}, {Name: "rust"}}, nil
			},
		}
		svc := NewTagService(nil, tags, &mockDocumentTagRepo{})
		result, err := svc.ListByNames(context.Background(), "u1", []string{"go", "rust"})
		require.NoError(t, err)
		assert.Len(t, result, 2)
	})

	t.Run("error", func(t *testing.T) {
		tags := &mockTagRepo{
			listByNamesFn: func(context.Context, string, []string) ([]model.Tag, error) {
				return nil, errors.New("db error")
			},
		}
		svc := NewTagService(nil, tags, &mockDocumentTagRepo{})
		_, err := svc.ListByNames(context.Background(), "u1", []string{"go"})
		assert.Error(t, err)
	})
}

func TestTagService_ListByIDs(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		tags := &mockTagRepo{
			listByIDsFn: func(context.Context, string, []string) ([]model.Tag, error) {
				return []model.Tag{{ID: "t1"}}, nil
			},
		}
		svc := NewTagService(nil, tags, &mockDocumentTagRepo{})
		result, err := svc.ListByIDs(context.Background(), "u1", []string{"t1"})
		require.NoError(t, err)
		assert.Len(t, result, 1)
	})

	t.Run("error", func(t *testing.T) {
		tags := &mockTagRepo{
			listByIDsFn: func(context.Context, string, []string) ([]model.Tag, error) {
				return nil, errors.New("db error")
			},
		}
		svc := NewTagService(nil, tags, &mockDocumentTagRepo{})
		_, err := svc.ListByIDs(context.Background(), "u1", []string{"t1"})
		assert.Error(t, err)
	})
}

func TestTagService_Delete(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		docTagsCalled := false
		tagsCalled := false
		tags := &mockTagRepo{
			deleteFn: func(_ context.Context, userID, tagID string) error {
				tagsCalled = true
				assert.Equal(t, "u1", userID)
				assert.Equal(t, "t1", tagID)
				return nil
			},
		}
		docTags := &mockDocumentTagRepo{
			deleteByTagFn: func(_ context.Context, userID, tagID string) error {
				docTagsCalled = true
				assert.Equal(t, "u1", userID)
				assert.Equal(t, "t1", tagID)
				return nil
			},
		}
		svc := NewTagService(nil, tags, docTags)
		err := svc.Delete(context.Background(), "u1", "t1")
		require.NoError(t, err)
		assert.True(t, docTagsCalled)
		assert.True(t, tagsCalled)
	})

	t.Run("delete_doc_tags_error", func(t *testing.T) {
		tags := &mockTagRepo{}
		docTags := &mockDocumentTagRepo{
			deleteByTagFn: func(context.Context, string, string) error {
				return errors.New("db error")
			},
		}
		svc := NewTagService(nil, tags, docTags)
		err := svc.Delete(context.Background(), "u1", "t1")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "delete by tag")
	})

	t.Run("delete_tag_error", func(t *testing.T) {
		tags := &mockTagRepo{
			deleteFn: func(context.Context, string, string) error {
				return errors.New("db error")
			},
		}
		docTags := &mockDocumentTagRepo{
			deleteByTagFn: func(context.Context, string, string) error { return nil },
		}
		svc := NewTagService(nil, tags, docTags)
		err := svc.Delete(context.Background(), "u1", "t1")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "delete")
	})
}

func TestTagService_UpdatePinned(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		tags := &mockTagRepo{
			updatePinnedFn: func(_ context.Context, userID, tagID string, pinned int, _ int64) error {
				assert.Equal(t, "u1", userID)
				assert.Equal(t, "t1", tagID)
				assert.Equal(t, 1, pinned)
				return nil
			},
		}
		svc := NewTagService(nil, tags, &mockDocumentTagRepo{})
		err := svc.UpdatePinned(context.Background(), "u1", "t1", 1)
		require.NoError(t, err)
	})

	t.Run("invalid_value", func(t *testing.T) {
		svc := NewTagService(nil, &mockTagRepo{}, &mockDocumentTagRepo{})
		err := svc.UpdatePinned(context.Background(), "u1", "t1", 2)
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("repo_error", func(t *testing.T) {
		tags := &mockTagRepo{
			updatePinnedFn: func(context.Context, string, string, int, int64) error {
				return errors.New("db error")
			},
		}
		svc := NewTagService(nil, tags, &mockDocumentTagRepo{})
		err := svc.UpdatePinned(context.Background(), "u1", "t1", 0)
		assert.Error(t, err)
	})
}
