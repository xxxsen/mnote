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

type mockTodoRepo struct {
	createFn          func(ctx context.Context, todo *model.Todo) error
	updateFn          func(ctx context.Context, todo *model.Todo) error
	updateDoneFn      func(ctx context.Context, userID, todoID string, done int, mtime int64) error
	getByIDFn         func(ctx context.Context, userID, todoID string) (*model.Todo, error)
	listByDateRangeFn func(ctx context.Context, userID, startDate, endDate string) ([]model.Todo, error)
	deleteFn          func(ctx context.Context, userID, todoID string) error
}

func (m *mockTodoRepo) Create(ctx context.Context, todo *model.Todo) error {
	return m.createFn(ctx, todo)
}

func (m *mockTodoRepo) Update(ctx context.Context, todo *model.Todo) error {
	return m.updateFn(ctx, todo)
}

func (m *mockTodoRepo) UpdateDone(ctx context.Context, userID, todoID string, done int, mtime int64) error {
	return m.updateDoneFn(ctx, userID, todoID, done, mtime)
}

func (m *mockTodoRepo) GetByID(ctx context.Context, userID, todoID string) (*model.Todo, error) {
	return m.getByIDFn(ctx, userID, todoID)
}

func (m *mockTodoRepo) ListByDateRange(ctx context.Context, userID, startDate, endDate string) ([]model.Todo, error) {
	return m.listByDateRangeFn(ctx, userID, startDate, endDate)
}

func (m *mockTodoRepo) Delete(ctx context.Context, userID, todoID string) error {
	return m.deleteFn(ctx, userID, todoID)
}

func TestTodoService_CreateTodo(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := &mockTodoRepo{
			createFn: func(_ context.Context, todo *model.Todo) error {
				assert.Equal(t, "u1", todo.UserID)
				assert.Equal(t, "buy milk", todo.Content)
				assert.Equal(t, "2026-04-28", todo.DueDate)
				assert.Equal(t, 0, todo.Done)
				return nil
			},
		}
		svc := NewTodoService(repo)
		todo, err := svc.CreateTodo(context.Background(), "u1", "buy milk", "2026-04-28", false)
		require.NoError(t, err)
		assert.Equal(t, "buy milk", todo.Content)
		assert.Equal(t, "u1", todo.UserID)
		assert.NotEmpty(t, todo.ID)
	})

	t.Run("done_flag", func(t *testing.T) {
		repo := &mockTodoRepo{
			createFn: func(_ context.Context, todo *model.Todo) error {
				assert.Equal(t, 1, todo.Done)
				return nil
			},
		}
		svc := NewTodoService(repo)
		todo, err := svc.CreateTodo(context.Background(), "u1", "done item", "", true)
		require.NoError(t, err)
		assert.Equal(t, 1, todo.Done)
	})

	t.Run("empty_content", func(t *testing.T) {
		svc := NewTodoService(&mockTodoRepo{})
		_, err := svc.CreateTodo(context.Background(), "u1", "", "", false)
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("repo_error", func(t *testing.T) {
		repo := &mockTodoRepo{
			createFn: func(context.Context, *model.Todo) error {
				return errors.New("db error")
			},
		}
		svc := NewTodoService(repo)
		_, err := svc.CreateTodo(context.Background(), "u1", "buy milk", "", false)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "create todo")
	})
}

func TestTodoService_ToggleDone(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := &mockTodoRepo{
			updateDoneFn: func(_ context.Context, userID, todoID string, done int, _ int64) error {
				assert.Equal(t, "u1", userID)
				assert.Equal(t, "t1", todoID)
				assert.Equal(t, 1, done)
				return nil
			},
		}
		svc := NewTodoService(repo)
		err := svc.ToggleDone(context.Background(), "u1", "t1", true)
		require.NoError(t, err)
	})

	t.Run("repo_error", func(t *testing.T) {
		repo := &mockTodoRepo{
			updateDoneFn: func(context.Context, string, string, int, int64) error {
				return errors.New("db error")
			},
		}
		svc := NewTodoService(repo)
		err := svc.ToggleDone(context.Background(), "u1", "t1", false)
		assert.Error(t, err)
	})
}

func TestTodoService_UpdateContent(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := &mockTodoRepo{
			getByIDFn: func(context.Context, string, string) (*model.Todo, error) {
				return &model.Todo{ID: "t1", UserID: "u1", Content: "old"}, nil
			},
			updateFn: func(_ context.Context, todo *model.Todo) error {
				assert.Equal(t, "new content", todo.Content)
				return nil
			},
		}
		svc := NewTodoService(repo)
		todo, err := svc.UpdateContent(context.Background(), "u1", "t1", "new content")
		require.NoError(t, err)
		assert.Equal(t, "new content", todo.Content)
	})

	t.Run("same_content_noop", func(t *testing.T) {
		repo := &mockTodoRepo{
			getByIDFn: func(context.Context, string, string) (*model.Todo, error) {
				return &model.Todo{ID: "t1", Content: "same"}, nil
			},
		}
		svc := NewTodoService(repo)
		todo, err := svc.UpdateContent(context.Background(), "u1", "t1", "same")
		require.NoError(t, err)
		assert.Equal(t, "same", todo.Content)
	})

	t.Run("empty_content", func(t *testing.T) {
		svc := NewTodoService(&mockTodoRepo{})
		_, err := svc.UpdateContent(context.Background(), "u1", "t1", "   ")
		assert.ErrorIs(t, err, appErr.ErrInvalid)
	})

	t.Run("get_error", func(t *testing.T) {
		repo := &mockTodoRepo{
			getByIDFn: func(context.Context, string, string) (*model.Todo, error) {
				return nil, errors.New("not found")
			},
		}
		svc := NewTodoService(repo)
		_, err := svc.UpdateContent(context.Background(), "u1", "t1", "new")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "get todo")
	})

	t.Run("update_error", func(t *testing.T) {
		repo := &mockTodoRepo{
			getByIDFn: func(context.Context, string, string) (*model.Todo, error) {
				return &model.Todo{ID: "t1", Content: "old"}, nil
			},
			updateFn: func(context.Context, *model.Todo) error {
				return errors.New("db error")
			},
		}
		svc := NewTodoService(repo)
		_, err := svc.UpdateContent(context.Background(), "u1", "t1", "new")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "update todo")
	})
}

func TestTodoService_ListByDateRange(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := &mockTodoRepo{
			listByDateRangeFn: func(_ context.Context, userID, _, _ string) ([]model.Todo, error) {
				assert.Equal(t, "u1", userID)
				return []model.Todo{{ID: "t1"}}, nil
			},
		}
		svc := NewTodoService(repo)
		list, err := svc.ListByDateRange(context.Background(), "u1", "2026-01-01", "2026-12-31")
		require.NoError(t, err)
		assert.Len(t, list, 1)
	})

	t.Run("repo_error", func(t *testing.T) {
		repo := &mockTodoRepo{
			listByDateRangeFn: func(context.Context, string, string, string) ([]model.Todo, error) {
				return nil, errors.New("db error")
			},
		}
		svc := NewTodoService(repo)
		_, err := svc.ListByDateRange(context.Background(), "u1", "2026-01-01", "2026-12-31")
		assert.Error(t, err)
	})
}

func TestTodoService_GetByID(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := &mockTodoRepo{
			getByIDFn: func(context.Context, string, string) (*model.Todo, error) {
				return &model.Todo{ID: "t1", Content: "hello"}, nil
			},
		}
		svc := NewTodoService(repo)
		todo, err := svc.GetByID(context.Background(), "u1", "t1")
		require.NoError(t, err)
		assert.Equal(t, "t1", todo.ID)
	})

	t.Run("not_found", func(t *testing.T) {
		repo := &mockTodoRepo{
			getByIDFn: func(context.Context, string, string) (*model.Todo, error) {
				return nil, appErr.ErrNotFound
			},
		}
		svc := NewTodoService(repo)
		_, err := svc.GetByID(context.Background(), "u1", "t1")
		assert.ErrorIs(t, err, appErr.ErrNotFound)
	})
}

func TestTodoService_DeleteTodo(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		repo := &mockTodoRepo{
			deleteFn: func(_ context.Context, userID, todoID string) error {
				assert.Equal(t, "u1", userID)
				assert.Equal(t, "t1", todoID)
				return nil
			},
		}
		svc := NewTodoService(repo)
		err := svc.DeleteTodo(context.Background(), "u1", "t1")
		require.NoError(t, err)
	})

	t.Run("repo_error", func(t *testing.T) {
		repo := &mockTodoRepo{
			deleteFn: func(context.Context, string, string) error {
				return errors.New("db error")
			},
		}
		svc := NewTodoService(repo)
		err := svc.DeleteTodo(context.Background(), "u1", "t1")
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "delete")
	})
}
