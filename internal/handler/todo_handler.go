package handler

import (
	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/pkg/errcode"
	"github.com/xxxsen/mnote/internal/pkg/response"
	"github.com/xxxsen/mnote/internal/service"
)

type TodoHandler struct {
	todos *service.TodoService
}

func NewTodoHandler(todos *service.TodoService) *TodoHandler {
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
