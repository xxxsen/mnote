package handler

import (
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/pkg/errcode"
	"github.com/xxxsen/mnote/internal/pkg/response"
)

const maxTodoContentLength = 500

type TodoHandler struct {
	todos ITodoHandlerService
}

func NewTodoHandler(todos ITodoHandlerService) *TodoHandler {
	return &TodoHandler{todos: todos}
}

type createTodoRequest struct {
	Content string `json:"content"`
	DueDate string `json:"due_date"`
	Done    *bool  `json:"done"`
}

func (h *TodoHandler) Create(c *gin.Context) {
	userID := getUserID(c)
	var req createTodoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request body")
		return
	}
	if req.Content == "" {
		response.Error(c, errcode.ErrInvalid, "content is required")
		return
	}
	if utf8.RuneCountInString(req.Content) > maxTodoContentLength {
		response.Error(c, errcode.ErrInvalid, "content is too long")
		return
	}
	if req.DueDate == "" {
		response.Error(c, errcode.ErrInvalid, "due_date is required")
		return
	}
	if _, err := time.Parse("2006-01-02", req.DueDate); err != nil {
		response.Error(c, errcode.ErrInvalid, "due_date must be in YYYY-MM-DD format")
		return
	}
	done := false
	if req.Done != nil {
		done = *req.Done
	}
	todo, err := h.todos.CreateTodo(c.Request.Context(), userID, req.Content, req.DueDate, done)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, todo)
}

func (h *TodoHandler) List(c *gin.Context) {
	userID := getUserID(c)
	startDate := c.Query("start")
	endDate := c.Query("end")
	if startDate == "" || endDate == "" {
		response.Error(c, errcode.ErrInvalid, "start and end query params are required (YYYY-MM-DD)")
		return
	}
	if _, err := time.Parse("2006-01-02", startDate); err != nil {
		response.Error(c, errcode.ErrInvalid, "start must be in YYYY-MM-DD format")
		return
	}
	if _, err := time.Parse("2006-01-02", endDate); err != nil {
		response.Error(c, errcode.ErrInvalid, "end must be in YYYY-MM-DD format")
		return
	}
	todos, err := h.todos.ListByDateRange(c.Request.Context(), userID, startDate, endDate)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, todos)
}

type toggleDoneRequest struct {
	Done bool `json:"done"`
}

type updateTodoRequest struct {
	Content string `json:"content"`
}

func (h *TodoHandler) ToggleDone(c *gin.Context) {
	userID := getUserID(c)
	todoID := c.Param("id")
	var req toggleDoneRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request body")
		return
	}
	if err := h.todos.ToggleDone(c.Request.Context(), userID, todoID, req.Done); err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, nil)
}

func (h *TodoHandler) Update(c *gin.Context) {
	userID := getUserID(c)
	todoID := c.Param("id")
	var req updateTodoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request body")
		return
	}
	if req.Content == "" {
		response.Error(c, errcode.ErrInvalid, "content is required")
		return
	}
	if utf8.RuneCountInString(req.Content) > maxTodoContentLength {
		response.Error(c, errcode.ErrInvalid, "content is too long")
		return
	}
	todo, err := h.todos.UpdateContent(c.Request.Context(), userID, todoID, req.Content)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, todo)
}

func (h *TodoHandler) Delete(c *gin.Context) {
	userID := getUserID(c)
	todoID := c.Param("id")
	if err := h.todos.DeleteTodo(c.Request.Context(), userID, todoID); err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, nil)
}
