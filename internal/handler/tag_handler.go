package handler

import (
	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/errcode"
	"github.com/xxxsen/mnote/internal/pkg/response"
)

type TagHandler struct {
	tags ITagService
}

func NewTagHandler(tags ITagService) *TagHandler {
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

type tagPinRequest struct {
	Pinned bool `json:"pinned"`
}

func (h *TagHandler) Create(c *gin.Context) {
	var req tagRequest
	if err := bindJSON(c, &req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	if req.Name == "" {
		response.Error(c, errcode.ErrInvalid, "name required")
		return
	}
	tag, err := h.tags.Create(c.Request.Context(), getUserID(c), req.Name)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, toTagResponse(*tag))
}

func (h *TagHandler) CreateBatch(c *gin.Context) {
	var req tagBatchRequest
	if err := bindJSON(c, &req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	if len(req.Names) == 0 {
		response.Error(c, errcode.ErrInvalid, "names required")
		return
	}
	tags, err := h.tags.CreateBatch(c.Request.Context(), getUserID(c), req.Names)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, toTagResponses(tags))
}

func (h *TagHandler) List(c *gin.Context) {
	query := c.Query("q")
	var (
		tags []model.Tag
		err  error
	)
	_, hasLimit := c.GetQuery("limit")
	_, hasOffset := c.GetQuery("offset")
	if query != "" || hasLimit || hasOffset {
		page, pageErr := parsePage(c, 20, 100)
		if pageErr != nil {
			response.Error(c, errcode.ErrInvalid, "invalid pagination")
			return
		}
		tags, err = h.tags.ListPage(
			c.Request.Context(), getUserID(c), query, page.Limit, page.Offset,
		)
	} else {
		tags, err = h.tags.List(c.Request.Context(), getUserID(c))
	}
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, toTagResponses(tags))
}

func (h *TagHandler) ListByIDs(c *gin.Context) {
	var req tagIDsRequest
	if err := bindJSON(c, &req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	if len(req.IDs) == 0 {
		response.Error(c, errcode.ErrInvalid, "ids required")
		return
	}
	tags, err := h.tags.ListByIDs(c.Request.Context(), getUserID(c), req.IDs)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, toTagResponses(tags))
}

func (h *TagHandler) Summary(c *gin.Context) {
	query := c.Query("q")
	page, err := parsePage(c, 20, 100)
	if err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid pagination")
		return
	}
	items, err := h.tags.ListSummary(
		c.Request.Context(), getUserID(c), query, page.Limit, page.Offset,
	)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, toTagSummaryResponses(items))
}

func (h *TagHandler) Delete(c *gin.Context) {
	if err := h.tags.Delete(c.Request.Context(), getUserID(c), c.Param("id")); err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"ok": true})
}

func (h *TagHandler) Pin(c *gin.Context) {
	var req tagPinRequest
	if err := bindJSON(c, &req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	pinnedValue := 0
	if req.Pinned {
		pinnedValue = 1
	}
	if err := h.tags.UpdatePinned(c.Request.Context(), getUserID(c), c.Param("id"), pinnedValue); err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"ok": true})
}
