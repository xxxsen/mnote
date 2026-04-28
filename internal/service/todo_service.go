package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
)

type TodoService struct {
	todos todoRepo
}

func NewTodoService(todos todoRepo) *TodoService {
	return &TodoService{todos: todos}
}

func (s *TodoService) CreateTodo(ctx context.Context, userID, content, dueDate string, done bool) (*model.Todo, error) {
	if content == "" {
		return nil, appErr.ErrInvalid
	}
	doneVal := 0
	if done {
		doneVal = 1
	}
	now := timeutil.NowUnix()
	todo := &model.Todo{
		ID:      newID(),
		UserID:  userID,
		Content: content,
		DueDate: dueDate,
		Done:    doneVal,
		Ctime:   now,
		Mtime:   now,
	}
	if err := s.todos.Create(ctx, todo); err != nil {
		return nil, fmt.Errorf("create todo: %w", err)
	}
	return todo, nil
}

func (s *TodoService) ToggleDone(ctx context.Context, userID, todoID string, done bool) error {
	doneVal := 0
	if done {
		doneVal = 1
	}
	now := timeutil.NowUnix()
	if err := s.todos.UpdateDone(ctx, userID, todoID, doneVal, now); err != nil {
		return fmt.Errorf("update done: %w", err)
	}
	return nil
}

func (s *TodoService) UpdateContent(ctx context.Context, userID, todoID, content string) (*model.Todo, error) {
	newContent := strings.TrimSpace(content)
	if newContent == "" {
		return nil, appErr.ErrInvalid
	}

	todo, err := s.todos.GetByID(ctx, userID, todoID)
	if err != nil {
		return nil, fmt.Errorf("get todo: %w", err)
	}

	if todo.Content == newContent {
		return todo, nil
	}

	now := timeutil.NowUnix()
	todo.Content = newContent
	todo.Mtime = now
	if err := s.todos.Update(ctx, todo); err != nil {
		return nil, fmt.Errorf("update todo: %w", err)
	}

	return todo, nil
}

func (s *TodoService) ListByDateRange(ctx context.Context, userID, startDate, endDate string) ([]model.Todo, error) {
	v0, err := s.todos.ListByDateRange(ctx, userID, startDate, endDate)
	if err != nil {
		return nil, fmt.Errorf("list by date range: %w", err)
	}
	return v0, nil
}

func (s *TodoService) GetByID(ctx context.Context, userID, todoID string) (*model.Todo, error) {
	v0, err := s.todos.GetByID(ctx, userID, todoID)
	if err != nil {
		return nil, fmt.Errorf("get by id: %w", err)
	}
	return v0, nil
}

func (s *TodoService) DeleteTodo(ctx context.Context, userID, todoID string) error {
	if err := s.todos.Delete(ctx, userID, todoID); err != nil {
		return fmt.Errorf("delete: %w", err)
	}
	return nil
}
