package handler

import (
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/errcode"
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

type tagUpdateRequest struct {
	TagIDs *[]string `json:"tag_ids"`
}

type summaryUpdateRequest struct {
	Summary *string `json:"summary"`
}
type documentListItem struct {
	ID      string      `json:"id"`
	UserID  string      `json:"user_id"`
	Title   string      `json:"title"`
	Content string      `json:"content"`
	Summary string      `json:"summary"`
	State   int         `json:"state"`
	Pinned  int         `json:"pinned"`
	Starred int         `json:"starred"`
	Ctime   int64       `json:"ctime"`
	Mtime   int64       `json:"mtime"`
	TagIDs  []string    `json:"tag_ids"`
	Tags    []model.Tag `json:"tags,omitempty"`
}

func (h *DocumentHandler) Create(c *gin.Context) {
	var req documentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	if req.Title == "" {
		response.Error(c, errcode.ErrInvalid, "title required")
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
	includeTags := false
	if value := c.Query("include"); value != "" {
		for _, part := range strings.Split(value, ",") {
			if strings.TrimSpace(part) == "tags" {
				includeTags = true
				break
			}
		}
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
	var tagIndex map[string]model.Tag
	if includeTags {
		uniqueIDs := make([]string, 0)
		seen := make(map[string]struct{})
		for _, ids := range tagMap {
			for _, id := range ids {
				if _, ok := seen[id]; ok {
					continue
				}
				seen[id] = struct{}{}
				uniqueIDs = append(uniqueIDs, id)
			}
		}
		if len(uniqueIDs) > 0 {
			tags, err := h.documents.ListTagsByIDs(c.Request.Context(), userID, uniqueIDs)
			if err != nil {
				handleError(c, err)
				return
			}
			tagIndex = make(map[string]model.Tag, len(tags))
			for _, tag := range tags {
				tagIndex[tag.ID] = tag
			}
		} else {
			tagIndex = map[string]model.Tag{}
		}
	}
	items := make([]documentListItem, 0, len(docs))
	for _, doc := range docs {
		tagIDs := tagMap[doc.ID]
		if tagIDs == nil {
			tagIDs = []string{}
		}
		item := documentListItem{
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
			TagIDs:  tagIDs,
		}
		if includeTags {
			tags := make([]model.Tag, 0, len(tagIDs))
			for _, id := range tagIDs {
				if tag, ok := tagIndex[id]; ok {
					tags = append(tags, tag)
				}
			}
			item.Tags = tags
		}
		items = append(items, item)
	}
	response.Success(c, items)
}

func (h *DocumentHandler) Get(c *gin.Context) {
	userID := getUserID(c)
	includeTags := false
	if value := c.Query("include"); value != "" {
		for _, part := range strings.Split(value, ",") {
			if strings.TrimSpace(part) == "tags" {
				includeTags = true
				break
			}
		}
	}
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
	if includeTags && len(tagIDs) > 0 {
		tags, err := h.documents.ListTagsByIDs(c.Request.Context(), userID, tagIDs)
		if err != nil {
			handleError(c, err)
			return
		}
		response.Success(c, gin.H{"document": doc, "tag_ids": tagIDs, "tags": tags})
		return
	}
	response.Success(c, gin.H{"document": doc, "tag_ids": tagIDs})
}

func (h *DocumentHandler) Update(c *gin.Context) {
	var req documentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	if req.Title == "" {
		response.Error(c, errcode.ErrInvalid, "title required")
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

func (h *DocumentHandler) UpdateTags(c *gin.Context) {
	var req tagUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	if req.TagIDs == nil {
		response.Error(c, errcode.ErrInvalid, "tag_ids required")
		return
	}
	if err := h.documents.UpdateTags(c.Request.Context(), getUserID(c), c.Param("id"), *req.TagIDs); err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"ok": true})
}

func (h *DocumentHandler) UpdateSummary(c *gin.Context) {
	var req summaryUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	if req.Summary == nil {
		response.Error(c, errcode.ErrInvalid, "summary required")
		return
	}
	if err := h.documents.UpdateSummary(c.Request.Context(), getUserID(c), c.Param("id"), *req.Summary); err != nil {
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
		response.Error(c, errcode.ErrInvalid, "invalid request")
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
		response.Error(c, errcode.ErrInvalid, "invalid request")
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
