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

type mockSavedViewRepo struct {
	listFn   func(ctx context.Context, userID string) ([]model.SavedView, error)
	createFn func(ctx context.Context, view *model.SavedView) error
	deleteFn func(ctx context.Context, userID, id string) error
}

func (m *mockSavedViewRepo) List(ctx context.Context, userID string) ([]model.SavedView, error) {
	return m.listFn(ctx, userID)
}

func (m *mockSavedViewRepo) Create(ctx context.Context, view *model.SavedView) error {
	return m.createFn(ctx, view)
}

func (m *mockSavedViewRepo) Delete(ctx context.Context, userID, id string) error {
	return m.deleteFn(ctx, userID, id)
}

func TestSavedViewService_List(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := &mockSavedViewRepo{
			listFn: func(_ context.Context, userID string) ([]model.SavedView, error) {
				assert.Equal(t, "u1", userID)
				return []model.SavedView{{ID: "sv1", Name: "My View"}}, nil
			},
		}
		svc := NewSavedViewService(repo)
		views, err := svc.List(context.Background(), "u1")
		require.NoError(t, err)
		assert.Len(t, views, 1)
		assert.Equal(t, "My View", views[0].Name)
	})

	t.Run("repo_error", func(t *testing.T) {
		repo := &mockSavedViewRepo{
			listFn: func(context.Context, string) ([]model.SavedView, error) {
				return nil, errors.New("db error")
			},
		}
		svc := NewSavedViewService(repo)
		_, err := svc.List(context.Background(), "u1")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "list")
	})
}

func TestSavedViewService_Create(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := &mockSavedViewRepo{
			createFn: func(_ context.Context, view *model.SavedView) error {
				assert.Equal(t, "u1", view.UserID)
				assert.Equal(t, "Test View", view.Name)
				assert.Equal(t, "golang", view.Search)
				return nil
			},
		}
		svc := NewSavedViewService(repo)
		view, err := svc.Create(context.Background(), "u1", SavedViewCreateInput{
			Name:   "Test View",
			Search: "golang",
		})
		require.NoError(t, err)
		assert.Equal(t, "Test View", view.Name)
		assert.NotEmpty(t, view.ID)
	})

	t.Run("empty_name", func(t *testing.T) {
		svc := NewSavedViewService(&mockSavedViewRepo{})
		_, err := svc.Create(context.Background(), "u1", SavedViewCreateInput{Name: ""})
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("name_too_long", func(t *testing.T) {
		svc := NewSavedViewService(&mockSavedViewRepo{})
		longName := string(make([]rune, 33))
		_, err := svc.Create(context.Background(), "u1", SavedViewCreateInput{Name: longName})
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("invalid_show_starred", func(t *testing.T) {
		svc := NewSavedViewService(&mockSavedViewRepo{})
		_, err := svc.Create(context.Background(), "u1", SavedViewCreateInput{
			Name:        "Test",
			ShowStarred: 2,
		})
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("invalid_show_shared", func(t *testing.T) {
		svc := NewSavedViewService(&mockSavedViewRepo{})
		_, err := svc.Create(context.Background(), "u1", SavedViewCreateInput{
			Name:       "Test",
			ShowShared: 5,
		})
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("repo_error", func(t *testing.T) {
		repo := &mockSavedViewRepo{
			createFn: func(context.Context, *model.SavedView) error {
				return errors.New("db error")
			},
		}
		svc := NewSavedViewService(repo)
		_, err := svc.Create(context.Background(), "u1", SavedViewCreateInput{Name: "Test"})
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "create saved view")
	})
}

func TestSavedViewService_Delete(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := &mockSavedViewRepo{
			deleteFn: func(_ context.Context, userID, id string) error {
				assert.Equal(t, "u1", userID)
				assert.Equal(t, "sv1", id)
				return nil
			},
		}
		svc := NewSavedViewService(repo)
		err := svc.Delete(context.Background(), "u1", "sv1")
		require.NoError(t, err)
	})

	t.Run("empty_id", func(t *testing.T) {
		svc := NewSavedViewService(&mockSavedViewRepo{})
		err := svc.Delete(context.Background(), "u1", "  ")
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("repo_error", func(t *testing.T) {
		repo := &mockSavedViewRepo{
			deleteFn: func(context.Context, string, string) error {
				return errors.New("db error")
			},
		}
		svc := NewSavedViewService(repo)
		err := svc.Delete(context.Background(), "u1", "sv1")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "delete")
	})
}
