package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"

	"github.com/xxxsen/mnote/internal/model"
)

func TestTodoHandler_Create_Success(t *testing.T) {
	mock := &mockTodoHandlerService{
		createFn: func(_ context.Context, userID, content, dueDate string, done bool) (*model.Todo, error) {
			return &model.Todo{ID: "t1", UserID: userID, Content: content, DueDate: dueDate, Done: 0}, nil
		},
	}
	h := &TodoHandler{todos: mock}
	r := newTestRouter()
	r.POST("/todos", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/todos", map[string]any{
		"content": "Buy milk", "due_date": "2026-05-01",
	})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	resp := parseResponseT(t, w)
	assert.Equal(t, float64(0), resp["code"])
}

func TestTodoHandler_Create_EmptyContent(t *testing.T) {
	h := &TodoHandler{todos: &mockTodoHandlerService{}}
	r := newTestRouter()
	r.POST("/todos", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/todos", map[string]any{
		"content": "", "due_date": "2026-05-01",
	})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTodoHandler_Create_ContentTooLong(t *testing.T) {
	h := &TodoHandler{todos: &mockTodoHandlerService{}}
	r := newTestRouter()
	r.POST("/todos", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/todos", map[string]any{
		"content": strings.Repeat("a", 501), "due_date": "2026-05-01",
	})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTodoHandler_Create_MissingDueDate(t *testing.T) {
	h := &TodoHandler{todos: &mockTodoHandlerService{}}
	r := newTestRouter()
	r.POST("/todos", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/todos", map[string]any{
		"content": "Do something",
	})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTodoHandler_Create_InvalidDueDate(t *testing.T) {
	h := &TodoHandler{todos: &mockTodoHandlerService{}}
	r := newTestRouter()
	r.POST("/todos", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/todos", map[string]any{
		"content": "Do something", "due_date": "not-a-date",
	})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTodoHandler_List_Success(t *testing.T) {
	mock := &mockTodoHandlerService{
		listByDateFn: func(_ context.Context, _, _, _ string) ([]model.Todo, error) {
			return []model.Todo{{ID: "t1"}}, nil
		},
	}
	h := &TodoHandler{todos: mock}
	r := newTestRouter()
	r.GET("/todos", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/todos?start=2026-01-01&end=2026-12-31", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTodoHandler_List_MissingDates(t *testing.T) {
	h := &TodoHandler{todos: &mockTodoHandlerService{}}
	r := newTestRouter()
	r.GET("/todos", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/todos", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTodoHandler_List_InvalidStartDate(t *testing.T) {
	h := &TodoHandler{todos: &mockTodoHandlerService{}}
	r := newTestRouter()
	r.GET("/todos", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/todos?start=bad&end=2026-12-31", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTodoHandler_List_InvalidEndDate(t *testing.T) {
	h := &TodoHandler{todos: &mockTodoHandlerService{}}
	r := newTestRouter()
	r.GET("/todos", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/todos?start=2026-01-01&end=bad", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTodoHandler_ToggleDone_Success(t *testing.T) {
	mock := &mockTodoHandlerService{
		toggleDoneFn: func(_ context.Context, _, _ string, _ bool) error { return nil },
	}
	h := &TodoHandler{todos: mock}
	r := newTestRouter()
	r.PUT("/todos/:id/done", withUserID("u1"), h.ToggleDone)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/todos/t1/done", map[string]any{"done": true})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTodoHandler_Update_Success(t *testing.T) {
	mock := &mockTodoHandlerService{
		updateFn: func(_ context.Context, _, _, content string) (*model.Todo, error) {
			return &model.Todo{ID: "t1", Content: content}, nil
		},
	}
	h := &TodoHandler{todos: mock}
	r := newTestRouter()
	r.PUT("/todos/:id", withUserID("u1"), h.Update)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/todos/t1", map[string]string{"content": "Updated"})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTodoHandler_Update_EmptyContent(t *testing.T) {
	h := &TodoHandler{todos: &mockTodoHandlerService{}}
	r := newTestRouter()
	r.PUT("/todos/:id", withUserID("u1"), h.Update)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/todos/t1", map[string]string{"content": ""})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTodoHandler_Delete_Success(t *testing.T) {
	mock := &mockTodoHandlerService{
		deleteFn: func(_ context.Context, _, _ string) error { return nil },
	}
	h := &TodoHandler{todos: mock}
	r := newTestRouter()
	r.DELETE("/todos/:id", withUserID("u1"), h.Delete)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/todos/t1", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestTodoHandler_Delete_Error(t *testing.T) {
	mock := &mockTodoHandlerService{
		deleteFn: func(_ context.Context, _, _ string) error { return errors.New("not found") },
	}
	h := &TodoHandler{todos: mock}
	r := newTestRouter()
	r.DELETE("/todos/:id", withUserID("u1"), h.Delete)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/todos/t1", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTodoHandler_Create_ServiceError(t *testing.T) {
	mock := &mockTodoHandlerService{
		createFn: func(_ context.Context, _, _, _ string, _ bool) (*model.Todo, error) {
			return nil, errors.New("create error")
		},
	}
	h := &TodoHandler{todos: mock}
	r := newTestRouter()
	r.POST("/todos", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/todos", map[string]any{
		"content": "task", "due_date": "2026-05-01",
	})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTodoHandler_List_ServiceError(t *testing.T) {
	mock := &mockTodoHandlerService{
		listByDateFn: func(_ context.Context, _, _, _ string) ([]model.Todo, error) {
			return nil, errors.New("list error")
		},
	}
	h := &TodoHandler{todos: mock}
	r := newTestRouter()
	r.GET("/todos", withUserID("u1"), h.List)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/todos?start=2026-01-01&end=2026-12-31", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTodoHandler_ToggleDone_ServiceError(t *testing.T) {
	mock := &mockTodoHandlerService{
		toggleDoneFn: func(_ context.Context, _, _ string, _ bool) error {
			return errors.New("toggle error")
		},
	}
	h := &TodoHandler{todos: mock}
	r := newTestRouter()
	r.PUT("/todos/:id/done", withUserID("u1"), h.ToggleDone)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/todos/t1/done", map[string]any{"done": true})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTodoHandler_ToggleDone_InvalidJSON(t *testing.T) {
	h := &TodoHandler{todos: &mockTodoHandlerService{}}
	r := newTestRouter()
	r.PUT("/todos/:id/done", withUserID("u1"), h.ToggleDone)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("PUT", "/todos/t1/done", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTodoHandler_Update_ServiceError(t *testing.T) {
	mock := &mockTodoHandlerService{
		updateFn: func(_ context.Context, _, _, _ string) (*model.Todo, error) {
			return nil, errors.New("update error")
		},
	}
	h := &TodoHandler{todos: mock}
	r := newTestRouter()
	r.PUT("/todos/:id", withUserID("u1"), h.Update)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/todos/t1", map[string]string{"content": "Updated"})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTodoHandler_Update_ContentTooLong(t *testing.T) {
	h := &TodoHandler{todos: &mockTodoHandlerService{}}
	r := newTestRouter()
	r.PUT("/todos/:id", withUserID("u1"), h.Update)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "PUT", "/todos/t1", map[string]string{"content": strings.Repeat("a", 501)})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTodoHandler_Update_InvalidJSON(t *testing.T) {
	h := &TodoHandler{todos: &mockTodoHandlerService{}}
	r := newTestRouter()
	r.PUT("/todos/:id", withUserID("u1"), h.Update)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("PUT", "/todos/t1", nil)
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestTodoHandler_Create_WithDone(t *testing.T) {
	var capturedDone bool
	mock := &mockTodoHandlerService{
		createFn: func(_ context.Context, _, _, _ string, done bool) (*model.Todo, error) {
			capturedDone = done
			return &model.Todo{ID: "t1", Done: 1}, nil
		},
	}
	h := &TodoHandler{todos: mock}
	r := newTestRouter()
	r.POST("/todos", withUserID("u1"), h.Create)

	w := httptest.NewRecorder()
	doneTrue := true
	req := jsonRequestT(t, "POST", "/todos", createTodoRequest{
		Content: "task", DueDate: "2026-05-01", Done: &doneTrue,
	})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.True(t, capturedDone)
}
