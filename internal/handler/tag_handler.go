package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/pkg/response"
	"github.com/xxxsen/mnote/internal/service"
)

type TagHandler struct {
	tags *service.TagService
}

func NewTagHandler(tags *service.TagService) *TagHandler {
	return &TagHandler{tags: tags}
}

type tagRequest struct {
	Name string `json:"name"`
}

func (h *TagHandler) Create(c *gin.Context) {
	var req tagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid", "invalid request")
		return
	}
	if req.Name == "" {
		response.Error(c, http.StatusBadRequest, "invalid", "name required")
		return
	}
	tag, err := h.tags.Create(c.Request.Context(), getUserID(c), req.Name)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, tag)
}

func (h *TagHandler) List(c *gin.Context) {
	tags, err := h.tags.List(c.Request.Context(), getUserID(c))
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, tags)
}

func (h *TagHandler) Delete(c *gin.Context) {
	if err := h.tags.Delete(c.Request.Context(), getUserID(c), c.Param("id")); err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"ok": true})
}
