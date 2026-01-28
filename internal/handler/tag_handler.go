package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/model"
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

type tagBatchRequest struct {
	Names []string `json:"names"`
}

type tagIDsRequest struct {
	IDs []string `json:"ids"`
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

func (h *TagHandler) CreateBatch(c *gin.Context) {
	var req tagBatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid", "invalid request")
		return
	}
	if len(req.Names) == 0 {
		response.Error(c, http.StatusBadRequest, "invalid", "names required")
		return
	}
	tags, err := h.tags.CreateBatch(c.Request.Context(), getUserID(c), req.Names)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, tags)
}

func (h *TagHandler) List(c *gin.Context) {
	query := c.Query("q")
	limit := 0
	offset := 0
	if value := c.Query("limit"); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil {
			limit = parsed
		}
	}
	if limit > 20 {
		limit = 20
	}
	if value := c.Query("offset"); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil {
			offset = parsed
		}
	}
	var (
		tags []model.Tag
		err  error
	)
	if query != "" || limit > 0 || offset > 0 {
		tags, err = h.tags.ListPage(c.Request.Context(), getUserID(c), query, limit, offset)
	} else {
		tags, err = h.tags.List(c.Request.Context(), getUserID(c))
	}
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, tags)
}

func (h *TagHandler) ListByIDs(c *gin.Context) {
	var req tagIDsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid", "invalid request")
		return
	}
	if len(req.IDs) == 0 {
		response.Error(c, http.StatusBadRequest, "invalid", "ids required")
		return
	}
	tags, err := h.tags.ListByIDs(c.Request.Context(), getUserID(c), req.IDs)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, tags)
}

func (h *TagHandler) Summary(c *gin.Context) {
	query := c.Query("q")
	limit := 20
	offset := 0
	if value := c.Query("limit"); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil {
			limit = parsed
		}
	}
	if limit > 20 {
		limit = 20
	}
	if value := c.Query("offset"); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil {
			offset = parsed
		}
	}
	items, err := h.tags.ListSummary(c.Request.Context(), getUserID(c), query, limit, offset)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, items)
}

func (h *TagHandler) Delete(c *gin.Context) {
	if err := h.tags.Delete(c.Request.Context(), getUserID(c), c.Param("id")); err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"ok": true})
}
