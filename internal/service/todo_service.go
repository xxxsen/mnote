package service

import (
	"context"
	"strings"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
	"github.com/xxxsen/mnote/internal/repo"
)

type TodoService struct {
	todos *repo.TodoRepo
}

func NewTodoService(todos *repo.TodoRepo) *TodoService {
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
		return nil, err
	}
	return todo, nil
}

func (s *TodoService) ToggleDone(ctx context.Context, userID, todoID string, done bool) error {
	doneVal := 0
	if done {
		doneVal = 1
	}
	now := timeutil.NowUnix()
	return s.todos.UpdateDone(ctx, userID, todoID, doneVal, now)
}

func (s *TodoService) UpdateContent(ctx context.Context, userID, todoID, content string) (*model.Todo, error) {
	newContent := strings.TrimSpace(content)
	if newContent == "" {
		return nil, appErr.ErrInvalid
	}

	todo, err := s.todos.GetByID(ctx, userID, todoID)
	if err != nil {
		return nil, err
	}

	if todo.Content == newContent {
		return todo, nil
	}

	now := timeutil.NowUnix()
	todo.Content = newContent
	todo.Mtime = now
	if err := s.todos.Update(ctx, todo); err != nil {
		return nil, err
	}

	return todo, nil
}

func (s *TodoService) ListByDateRange(ctx context.Context, userID, startDate, endDate string) ([]model.Todo, error) {
	return s.todos.ListByDateRange(ctx, userID, startDate, endDate)
}

func (s *TodoService) GetByID(ctx context.Context, userID, todoID string) (*model.Todo, error) {
	return s.todos.GetByID(ctx, userID, todoID)
}

func (s *TodoService) DeleteTodo(ctx context.Context, userID, todoID string) error {
	return s.todos.Delete(ctx, userID, todoID)
}
