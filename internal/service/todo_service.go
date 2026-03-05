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
// - [ ] content <!-- mnote=todo t=Ab3k9P2x d=YYYY-MM-DD -->
// - [x] content <!-- mnote=todo t=Ab3k9P2x d=YYYY-MM-DD -->
var todoLinePattern = regexp.MustCompile(`^(\s*-\s*\[)([ xX])(\]\s*)(.+?)\s*<!--\s*(.*?)\s*-->\s*$`)
var todoTaskLinePattern = regexp.MustCompile(`^\s*-\s*\[[ xX]\]`)
var todoMarkerIDPattern = regexp.MustCompile(`^[A-Za-z0-9]{8}$`)
var todoDatePattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

type parsedTodo struct {
	MarkerID string
	Content  string
	DueDate  string
	Done     bool
}

type parsedTodoLine struct {
	Prefix   string
	Checkbox string
	Suffix   string
	Content  string
	MarkerID string
	DueDate  string
}

func formatTodoMarker(markerID, dueDate string) string {
	return fmt.Sprintf("<!-- mnote=todo t=%s d=%s -->", markerID, dueDate)
}

func parseTodoMarker(raw string) (markerID, dueDate string, ok bool) {
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
	markerID = m["t"]
	dueDate = m["d"]
	if !todoMarkerIDPattern.MatchString(markerID) || !todoDatePattern.MatchString(dueDate) {
		return "", "", false
	}
	return markerID, dueDate, true
}

func parseTodoLine(line string) (parsedTodoLine, bool) {
	m := todoLinePattern.FindStringSubmatch(line)
	if m == nil {
		return parsedTodoLine{}, false
	}
	markerID, dueDate, ok := parseTodoMarker(m[5])
	if !ok {
		return parsedTodoLine{}, false
	}
	return parsedTodoLine{
		Prefix:   m[1],
		Checkbox: m[2],
		Suffix:   m[3],
		Content:  m[4],
		MarkerID: markerID,
		DueDate:  dueDate,
	}, true
}

func parseTodosFromContent(content string) ([]parsedTodo, []int) {
	var todos []parsedTodo
	invalidLines := make([]int, 0)
	lines := strings.Split(content, "\n")
	for i, line := range lines {
		if !todoTaskLinePattern.MatchString(line) {
			continue
		}
		if !strings.Contains(line, "mnote=todo") {
			continue
		}

		item, ok := parseTodoLine(line)
		if !ok {
			invalidLines = append(invalidLines, i+1)
			continue
		}
		done := item.Checkbox == "x" || item.Checkbox == "X"
		todos = append(todos, parsedTodo{
			MarkerID: item.MarkerID,
			Content:  strings.TrimSpace(item.Content),
			DueDate:  item.DueDate,
			Done:     done,
		})
	}
	return todos, invalidLines
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
	for i := 0; i < 5; i++ {
		todo := &model.Todo{
			ID:         newID(),
			MarkerID:   newMarkerID(),
			UserID:     userID,
			DocumentID: docID,
			Content:    content,
			DueDate:    dueDate,
			Done:       doneVal,
			Ctime:      now,
			Mtime:      now,
		}
		if err := s.todos.Create(ctx, todo); err != nil {
			if err == appErr.ErrConflict {
				continue
			}
			return nil, err
		}
		return todo, nil
	}
	return nil, appErr.ErrConflict
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
		if !ok || item.MarkerID != todo.MarkerID {
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
		lines[i] = item.Prefix + newCheck + item.Suffix + item.Content + " " + formatTodoMarker(item.MarkerID, item.DueDate)
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
		if !ok || item.MarkerID != todo.MarkerID {
			continue
		}
		lines[i] = item.Prefix + item.Checkbox + item.Suffix + newContent + " " + formatTodoMarker(item.MarkerID, item.DueDate)
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

	parsed, invalidLines := parseTodosFromContent(content)
	if len(invalidLines) > 0 {
		lineParts := make([]string, 0, len(invalidLines))
		for _, line := range invalidLines {
			lineParts = append(lineParts, fmt.Sprintf("%d", line))
		}
		return appErr.WrapInvalid("invalid todo marker at line(s): " + strings.Join(lineParts, ", ") + ", expected <!-- mnote=todo t=XXXXXXXX d=YYYY-MM-DD -->")
	}
	existing, err := s.todos.ListByDocumentID(ctx, userID, docID)
	if err != nil {
		return err
	}

	existingMap := make(map[string]*model.Todo)
	for i := range existing {
		existingMap[existing[i].MarkerID] = &existing[i]
	}

	now := timeutil.NowUnix()
	parsedMarkerIDs := make(map[string]bool)

	for _, p := range parsed {
		if parsedMarkerIDs[p.MarkerID] {
			return appErr.ErrConflict
		}
		parsedMarkerIDs[p.MarkerID] = true

		doneVal := 0
		if p.Done {
			doneVal = 1
		}

		if ex, ok := existingMap[p.MarkerID]; ok {
			// Update if content, due_date, or done changed
			if ex.Content != p.Content || ex.DueDate != p.DueDate || ex.Done != doneVal {
				ex.Content = p.Content
				ex.DueDate = p.DueDate
				ex.Done = doneVal
				ex.Mtime = now
				if err := s.todos.Update(ctx, ex); err != nil {
					logger.Warn("failed to update todo", zap.String("marker_id", p.MarkerID), zap.Error(err))
				}
			}
		} else {
			// New todo referenced in content but not in DB — create it
			todo := &model.Todo{
				ID:         newID(),
				MarkerID:   p.MarkerID,
				UserID:     userID,
				DocumentID: docID,
				Content:    p.Content,
				DueDate:    p.DueDate,
				Done:       doneVal,
				Ctime:      now,
				Mtime:      now,
			}
			if err := s.todos.Create(ctx, todo); err != nil {
				logger.Warn("failed to create todo from content", zap.String("marker_id", p.MarkerID), zap.Error(err))
			}
		}
	}

	// Delete todos that are no longer in content
	var toDelete []string
	for markerID, todo := range existingMap {
		if !parsedMarkerIDs[markerID] {
			toDelete = append(toDelete, todo.ID)
		}
	}
	if len(toDelete) > 0 {
		if err := s.todos.DeleteByIDs(ctx, userID, toDelete); err != nil {
			logger.Warn("failed to delete removed todos", zap.Error(err))
		}
	}

	return nil
}
