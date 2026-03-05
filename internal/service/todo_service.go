package service

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"github.com/xxxsen/common/logutil"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
	"github.com/xxxsen/mnote/internal/repo"
)

// todoLinePattern matches lines like:
// - [ ] content <!-- mnote=todo id=... date=YYYY-MM-DD -->
// - [x] content <!-- mnote=todo id=... date=YYYY-MM-DD -->
var todoLinePattern = regexp.MustCompile(`^(\s*-\s*\[)([ xX])(\]\s*)(.+?)\s*<!--\s*(.*?)\s*-->\s*$`)
var todoIDPattern = regexp.MustCompile(`^[a-f0-9]+$`)
var todoDatePattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

type parsedTodo struct {
	ID      string
	Content string
	DueDate string
	Done    bool
}

type parsedTodoLine struct {
	Prefix   string
	Checkbox string
	Suffix   string
	Content  string
	ID       string
	DueDate  string
}

func formatTodoMarker(id, dueDate string) string {
	return fmt.Sprintf("<!-- mnote=todo id=%s date=%s -->", id, dueDate)
}

func parseTodoMarker(raw string) (id, dueDate string, ok bool) {
	fields := strings.Fields(strings.TrimSpace(raw))
	if len(fields) == 0 {
		return "", "", false
	}
	m := make(map[string]string, len(fields))
	for _, field := range fields {
		parts := strings.SplitN(field, "=", 2)
		if len(parts) != 2 {
			continue
		}
		m[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
	}
	if m["mnote"] != "todo" {
		return "", "", false
	}
	id = m["id"]
	dueDate = m["date"]
	if !todoIDPattern.MatchString(id) || !todoDatePattern.MatchString(dueDate) {
		return "", "", false
	}
	return id, dueDate, true
}

func parseTodoLine(line string) (parsedTodoLine, bool) {
	m := todoLinePattern.FindStringSubmatch(line)
	if m == nil {
		return parsedTodoLine{}, false
	}
	id, dueDate, ok := parseTodoMarker(m[5])
	if !ok {
		return parsedTodoLine{}, false
	}
	return parsedTodoLine{
		Prefix:   m[1],
		Checkbox: m[2],
		Suffix:   m[3],
		Content:  m[4],
		ID:       id,
		DueDate:  dueDate,
	}, true
}

func parseTodosFromContent(content string) []parsedTodo {
	var todos []parsedTodo
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		item, ok := parseTodoLine(line)
		if !ok {
			continue
		}
		done := item.Checkbox == "x" || item.Checkbox == "X"
		todos = append(todos, parsedTodo{
			ID:      item.ID,
			Content: strings.TrimSpace(item.Content),
			DueDate: item.DueDate,
			Done:    done,
		})
	}
	return todos
}

type TodoService struct {
	todos *repo.TodoRepo
	docs  *repo.DocumentRepo
}

func NewTodoService(todos *repo.TodoRepo, docs *repo.DocumentRepo) *TodoService {
	return &TodoService{todos: todos, docs: docs}
}

func (s *TodoService) CreateTodo(ctx context.Context, userID, docID, content, dueDate string, done bool) (*model.Todo, error) {
	if content == "" {
		return nil, appErr.ErrInvalid
	}
	doneVal := 0
	if done {
		doneVal = 1
	}
	now := timeutil.NowUnix()
	todo := &model.Todo{
		ID:         newID(),
		UserID:     userID,
		DocumentID: docID,
		Content:    content,
		DueDate:    dueDate,
		Done:       doneVal,
		Ctime:      now,
		Mtime:      now,
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

// ToggleDoneAndSync toggles the TODO done state and updates the corresponding
// document content to reflect the change (- [ ] <-> - [x]).
func (s *TodoService) ToggleDoneAndSync(ctx context.Context, userID, todoID string, done bool) error {
	logger := logutil.GetLogger(ctx)

	todo, err := s.todos.GetByID(ctx, userID, todoID)
	if err != nil {
		return err
	}

	doneVal := 0
	if done {
		doneVal = 1
	}
	now := timeutil.NowUnix()
	if err := s.todos.UpdateDone(ctx, userID, todoID, doneVal, now); err != nil {
		return err
	}

	if todo.DocumentID == "" {
		return nil
	}

	// Update document content
	doc, err := s.docs.GetByID(ctx, userID, todo.DocumentID)
	if err != nil {
		logger.Warn("failed to get document for todo sync", zap.String("doc_id", todo.DocumentID), zap.Error(err))
		return nil // Don't fail the toggle if doc sync fails
	}

	lines := strings.Split(doc.Content, "\n")
	changed := false
	for i, line := range lines {
		item, ok := parseTodoLine(line)
		if !ok || item.ID != todoID {
			continue
		}
		oldCheck := item.Checkbox
		var newCheck string
		if done {
			newCheck = "x"
		} else {
			newCheck = " "
		}
		if oldCheck == newCheck || (done && (oldCheck == "x" || oldCheck == "X")) {
			continue
		}
		lines[i] = item.Prefix + newCheck + item.Suffix + item.Content + " " + formatTodoMarker(item.ID, item.DueDate)
		changed = true
		break
	}

	if changed {
		newContent := strings.Join(lines, "\n")
		updatedDoc := &model.Document{
			ID:      doc.ID,
			UserID:  userID,
			Title:   doc.Title,
			Content: newContent,
			Mtime:   now,
		}
		if err := s.docs.Update(ctx, updatedDoc); err != nil {
			logger.Warn("failed to sync document content for todo", zap.String("doc_id", doc.ID), zap.Error(err))
		}
	}

	return nil
}

// UpdateContentAndSync updates todo content and, if linked to a document,
// updates the corresponding markdown line content in that document.
func (s *TodoService) UpdateContentAndSync(ctx context.Context, userID, todoID, content string) (*model.Todo, error) {
	logger := logutil.GetLogger(ctx)
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

	if todo.DocumentID == "" {
		return todo, nil
	}

	doc, err := s.docs.GetByID(ctx, userID, todo.DocumentID)
	if err != nil {
		logger.Warn("failed to get document for todo content sync", zap.String("doc_id", todo.DocumentID), zap.Error(err))
		return todo, nil
	}

	lines := strings.Split(doc.Content, "\n")
	changed := false
	for i, line := range lines {
		item, ok := parseTodoLine(line)
		if !ok || item.ID != todoID {
			continue
		}
		lines[i] = item.Prefix + item.Checkbox + item.Suffix + newContent + " " + formatTodoMarker(item.ID, item.DueDate)
		changed = true
		break
	}

	if changed {
		updatedDoc := &model.Document{
			ID:      doc.ID,
			UserID:  userID,
			Title:   doc.Title,
			Content: strings.Join(lines, "\n"),
			Mtime:   now,
		}
		if err := s.docs.Update(ctx, updatedDoc); err != nil {
			logger.Warn("failed to sync document content for todo update", zap.String("doc_id", doc.ID), zap.Error(err))
		}
	}

	return todo, nil
}

func (s *TodoService) ListByDateRange(ctx context.Context, userID, startDate, endDate string) ([]model.Todo, error) {
	return s.todos.ListByDateRange(ctx, userID, startDate, endDate)
}

func (s *TodoService) ListByDocumentID(ctx context.Context, userID, docID string) ([]model.Todo, error) {
	return s.todos.ListByDocumentID(ctx, userID, docID)
}

func (s *TodoService) GetByID(ctx context.Context, userID, todoID string) (*model.Todo, error) {
	return s.todos.GetByID(ctx, userID, todoID)
}

func (s *TodoService) DeleteTodo(ctx context.Context, userID, todoID string) error {
	return s.todos.Delete(ctx, userID, todoID)
}

// SyncTodosFromContent parses TODO markers from document content and syncs them
// with the todos table: create new ones, update changed ones, delete removed ones.
func (s *TodoService) SyncTodosFromContent(ctx context.Context, userID, docID, content string) error {
	logger := logutil.GetLogger(ctx)

	parsed := parseTodosFromContent(content)
	existing, err := s.todos.ListByDocumentID(ctx, userID, docID)
	if err != nil {
		return err
	}

	existingMap := make(map[string]*model.Todo)
	for i := range existing {
		existingMap[existing[i].ID] = &existing[i]
	}

	now := timeutil.NowUnix()
	parsedIDs := make(map[string]bool)

	for _, p := range parsed {
		parsedIDs[p.ID] = true
		doneVal := 0
		if p.Done {
			doneVal = 1
		}

		if ex, ok := existingMap[p.ID]; ok {
			// Update if content, due_date, or done changed
			if ex.Content != p.Content || ex.DueDate != p.DueDate || ex.Done != doneVal {
				ex.Content = p.Content
				ex.DueDate = p.DueDate
				ex.Done = doneVal
				ex.Mtime = now
				if err := s.todos.Update(ctx, ex); err != nil {
					logger.Warn("failed to update todo", zap.String("todo_id", p.ID), zap.Error(err))
				}
			}
		} else {
			// New todo referenced in content but not in DB — create it
			todo := &model.Todo{
				ID:         p.ID,
				UserID:     userID,
				DocumentID: docID,
				Content:    p.Content,
				DueDate:    p.DueDate,
				Done:       doneVal,
				Ctime:      now,
				Mtime:      now,
			}
			if err := s.todos.Create(ctx, todo); err != nil {
				logger.Warn("failed to create todo from content", zap.String("todo_id", p.ID), zap.Error(err))
			}
		}
	}

	// Delete todos that are no longer in content
	var toDelete []string
	for id := range existingMap {
		if !parsedIDs[id] {
			toDelete = append(toDelete, id)
		}
	}
	if len(toDelete) > 0 {
		if err := s.todos.DeleteByIDs(ctx, userID, toDelete); err != nil {
			logger.Warn("failed to delete removed todos", zap.Error(err))
		}
	}

	return nil
}
