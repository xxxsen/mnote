package handler

import (
	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/pkg/errcode"
	"github.com/xxxsen/mnote/internal/pkg/response"
	"github.com/xxxsen/mnote/internal/service"
)

type SavedViewHandler struct {
	service *service.SavedViewService
}

func NewSavedViewHandler(service *service.SavedViewService) *SavedViewHandler {
	return &SavedViewHandler{service: service}
}

type savedViewCreateRequest struct {
	Name        string `json:"name"`
	Search      string `json:"search"`
	TagID       string `json:"tag_id"`
	ShowStarred bool   `json:"show_starred"`
	ShowShared  bool   `json:"show_shared"`
}

func (h *SavedViewHandler) List(c *gin.Context) {
	items, err := h.service.List(c.Request.Context(), getUserID(c))
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, items)
}

func (h *SavedViewHandler) Create(c *gin.Context) {
	var req savedViewCreateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	showStarred := 0
	if req.ShowStarred {
		showStarred = 1
	}
	showShared := 0
	if req.ShowShared {
		showShared = 1
	}
	item, err := h.service.Create(c.Request.Context(), getUserID(c), service.SavedViewCreateInput{
		Name:        req.Name,
		Search:      req.Search,
		TagID:       req.TagID,
		ShowStarred: showStarred,
		ShowShared:  showShared,
	})
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, item)
}

func (h *SavedViewHandler) Delete(c *gin.Context) {
	if err := h.service.Delete(c.Request.Context(), getUserID(c), c.Param("id")); err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"ok": true})
}
