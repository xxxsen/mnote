package handler

import (
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/errcode"
	"github.com/xxxsen/mnote/internal/pkg/response"
	"github.com/xxxsen/mnote/internal/service"
)

type AIHandler struct {
	ai        *service.AIService
	documents *service.DocumentService
	tags      *service.TagService
}

func NewAIHandler(ai *service.AIService, documents *service.DocumentService, tags *service.TagService) *AIHandler {
	return &AIHandler{ai: ai, documents: documents, tags: tags}
}

type aiPolishRequest struct {
	Text string `json:"text"`
}

type aiGenerateRequest struct {
	Prompt string `json:"prompt"`
}

type aiSummaryRequest struct {
	Text string `json:"text"`
}

type aiTagsRequest struct {
	DocumentID string `json:"document_id"`
	Text       string `json:"text"`
	MaxTags    int    `json:"max_tags"`
}

func (h *AIHandler) Polish(c *gin.Context) {
	var req aiPolishRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	result, err := h.ai.Polish(c.Request.Context(), req.Text)
	if err != nil {
		if errors.Is(err, service.ErrAIUnavailable) {
			response.Error(c, errcode.ErrAIUnavailable, "ai not configured")
			return
		}
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"text": result})
}

func (h *AIHandler) Generate(c *gin.Context) {
	var req aiGenerateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	result, err := h.ai.Generate(c.Request.Context(), req.Prompt)
	if err != nil {
		if errors.Is(err, service.ErrAIUnavailable) {
			response.Error(c, errcode.ErrAIUnavailable, "ai not configured")
			return
		}
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"text": result})
}

func (h *AIHandler) Summary(c *gin.Context) {
	var req aiSummaryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	result, err := h.ai.Summarize(c.Request.Context(), req.Text)
	if err != nil {
		if errors.Is(err, service.ErrAIUnavailable) {
			response.Error(c, errcode.ErrAIUnavailable, "ai not configured")
			return
		}
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"summary": result})
}

func (h *AIHandler) Tags(c *gin.Context) {
	var req aiTagsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	tags, err := h.ai.ExtractTags(c.Request.Context(), req.Text, req.MaxTags)
	if err != nil {
		if errors.Is(err, service.ErrAIUnavailable) {
			response.Error(c, errcode.ErrAIUnavailable, "ai not configured")
			return
		}
		handleError(c, err)
		return
	}
	var existingTags []model.Tag
	if req.DocumentID != "" {
		userID := getUserID(c)
		tagIDs, err := h.documents.ListTagIDs(c.Request.Context(), userID, req.DocumentID)
		if err != nil {
			handleError(c, err)
			return
		}
		if len(tagIDs) > 0 {
			existingTags, err = h.tags.ListByIDs(c.Request.Context(), userID, tagIDs)
			if err != nil {
				handleError(c, err)
				return
			}
		}
	}
	response.Success(c, gin.H{"tags": tags, "existing_tags": existingTags})
}

func (h *AIHandler) Search(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		response.Error(c, errcode.ErrInvalid, "query required")
		return
	}
	limitStr := c.DefaultQuery("limit", "4")
	limit, _ := strconv.Atoi(limitStr)
	if limit <= 0 || limit > 20 {
		limit = 20
	}
	excludeID := c.Query("exclude_id")

	userID := getUserID(c)
	docIDs, scores, err := h.ai.SemanticSearch(c.Request.Context(), userID, query, limit, excludeID)
	if err != nil {
		handleError(c, err)
		return
	}
	if len(docIDs) == 0 {
		response.Success(c, gin.H{"items": []interface{}{}})
		return
	}
	docs, err := h.documents.ListByIDs(c.Request.Context(), userID, docIDs)
	if err != nil {
		handleError(c, err)
		return
	}

	type documentWithScore struct {
		model.Document
		Score float32 `json:"score"`
	}

	docMap := make(map[string]model.Document)
	for _, doc := range docs {
		docMap[doc.ID] = doc
	}
	results := make([]documentWithScore, 0, len(docIDs))
	for i, id := range docIDs {
		if doc, ok := docMap[id]; ok {
			results = append(results, documentWithScore{
				Document: doc,
				Score:    scores[i],
			})
		}
	}
	response.Success(c, gin.H{"items": results})
}
