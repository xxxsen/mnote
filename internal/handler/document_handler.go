package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/pkg/response"
	"github.com/xxxsen/mnote/internal/service"
)

type DocumentHandler struct {
	documents *service.DocumentService
}

func NewDocumentHandler(documents *service.DocumentService) *DocumentHandler {
	return &DocumentHandler{documents: documents}
}

type documentRequest struct {
	Title   string    `json:"title"`
	Content string    `json:"content"`
	TagIDs  *[]string `json:"tag_ids"`
}

func (h *DocumentHandler) Create(c *gin.Context) {
	var req documentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid", "invalid request")
		return
	}
	if req.Title == "" {
		response.Error(c, http.StatusBadRequest, "invalid", "title required")
		return
	}
	var tagIDs []string
	if req.TagIDs != nil {
		tagIDs = *req.TagIDs
	}
	doc, err := h.documents.Create(c.Request.Context(), getUserID(c), service.DocumentCreateInput{
		Title:   req.Title,
		Content: req.Content,
		TagIDs:  tagIDs,
	})
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, doc)
}

func (h *DocumentHandler) List(c *gin.Context) {
	userID := getUserID(c)
	query := c.Query("q")
	tagID := c.Query("tag_id")
	limit := uint(0)
	if value := c.Query("limit"); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 {
			limit = uint(parsed)
		}
	}
	docs, err := h.documents.Search(c.Request.Context(), userID, query, tagID, limit)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, docs)
}

func (h *DocumentHandler) Get(c *gin.Context) {
	userID := getUserID(c)
	doc, err := h.documents.Get(c.Request.Context(), userID, c.Param("id"))
	if err != nil {
		handleError(c, err)
		return
	}
	tagIDs, err := h.documents.ListTagIDs(c.Request.Context(), userID, c.Param("id"))
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"document": doc, "tag_ids": tagIDs})
}

func (h *DocumentHandler) Update(c *gin.Context) {
	var req documentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid", "invalid request")
		return
	}
	if req.Title == "" {
		response.Error(c, http.StatusBadRequest, "invalid", "title required")
		return
	}
	var tagIDs []string
	if req.TagIDs != nil {
		tagIDs = *req.TagIDs
	}
	err := h.documents.Update(c.Request.Context(), getUserID(c), c.Param("id"), service.DocumentUpdateInput{
		Title:   req.Title,
		Content: req.Content,
		TagIDs:  tagIDs,
	})
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"ok": true})
}

type pinRequest struct {
	Pinned bool `json:"pinned"`
}

func (h *DocumentHandler) Pin(c *gin.Context) {
	var req pinRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid", "invalid request")
		return
	}
	pinnedValue := 0
	if req.Pinned {
		pinnedValue = 1
	}
	if err := h.documents.UpdatePinned(c.Request.Context(), getUserID(c), c.Param("id"), pinnedValue); err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"ok": true})
}

func (h *DocumentHandler) Delete(c *gin.Context) {
	if err := h.documents.Delete(c.Request.Context(), getUserID(c), c.Param("id")); err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"ok": true})
}
