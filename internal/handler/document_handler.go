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
	Summary *string   `json:"summary"`
}
type documentListItem struct {
	ID      string   `json:"id"`
	UserID  string   `json:"user_id"`
	Title   string   `json:"title"`
	Content string   `json:"content"`
	Summary string   `json:"summary"`
	State   int      `json:"state"`
	Pinned  int      `json:"pinned"`
	Starred int      `json:"starred"`
	Ctime   int64    `json:"ctime"`
	Mtime   int64    `json:"mtime"`
	TagIDs  []string `json:"tag_ids"`
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
	summary := ""
	if req.TagIDs != nil {
		tagIDs = *req.TagIDs
	}
	if req.Summary != nil {
		summary = *req.Summary
	}
	doc, err := h.documents.Create(c.Request.Context(), getUserID(c), service.DocumentCreateInput{
		Title:   req.Title,
		Content: req.Content,
		TagIDs:  tagIDs,
		Summary: summary,
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
	var starred *int
	if value := c.Query("starred"); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil {
			val := parsed
			starred = &val
		}
	}
	limit := uint(0)
	offset := uint(0)
	orderBy := ""
	if value := c.Query("limit"); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 {
			limit = uint(parsed)
		}
	}
	if value := c.Query("offset"); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil && parsed >= 0 {
			offset = uint(parsed)
		}
	}
	if value := c.Query("order"); value == "mtime" {
		orderBy = "mtime desc"
	}
	docs, err := h.documents.Search(c.Request.Context(), userID, query, tagID, starred, limit, offset, orderBy)
	if err != nil {
		handleError(c, err)
		return
	}
	ids := make([]string, 0, len(docs))
	for _, doc := range docs {
		ids = append(ids, doc.ID)
	}
	tagMap, err := h.documents.ListTagIDsByDocIDs(c.Request.Context(), userID, ids)
	if err != nil {
		handleError(c, err)
		return
	}
	items := make([]documentListItem, 0, len(docs))
	for _, doc := range docs {
		tags := tagMap[doc.ID]
		if tags == nil {
			tags = []string{}
		}
		items = append(items, documentListItem{
			ID:      doc.ID,
			UserID:  doc.UserID,
			Title:   doc.Title,
			Content: doc.Content,
			Summary: doc.Summary,
			State:   doc.State,
			Pinned:  doc.Pinned,
			Starred: doc.Starred,
			Ctime:   doc.Ctime,
			Mtime:   doc.Mtime,
			TagIDs:  tags,
		})
	}
	response.Success(c, items)
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
		Summary: req.Summary,
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

type starRequest struct {
	Starred bool `json:"starred"`
}

func (h *DocumentHandler) Star(c *gin.Context) {
	var req starRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid", "invalid request")
		return
	}
	starredValue := 0
	if req.Starred {
		starredValue = 1
	}
	if err := h.documents.UpdateStarred(c.Request.Context(), getUserID(c), c.Param("id"), starredValue); err != nil {
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

func (h *DocumentHandler) Summary(c *gin.Context) {
	limit := uint(5)
	if value := c.Query("limit"); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 {
			limit = uint(parsed)
		}
	}
	result, err := h.documents.Summary(c.Request.Context(), getUserID(c), limit)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{
		"recent":        result.Recent,
		"tag_counts":    result.TagCounts,
		"total":         result.Total,
		"starred_total": result.StarredTotal,
	})
}
