package handler

import (
	"errors"
	"fmt"

	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/ai"
	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/errcode"
	"github.com/xxxsen/mnote/internal/pkg/response"
	"github.com/xxxsen/mnote/internal/pkg/safeconv"
)

type AIHandler struct {
	ai        IAIHandlerService
	documents ISemanticSearchHandlerService
	tags      IAITagLookupService
}

func NewAIHandler(
	ai IAIHandlerService,
	documents ISemanticSearchHandlerService,
	tags IAITagLookupService,
) *AIHandler {
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
	if err := bindJSON(c, &req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	result, err := h.ai.Polish(c.Request.Context(), req.Text)
	if err != nil {
		if errors.Is(err, ai.ErrUnavailable) {
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
	if err := bindJSON(c, &req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	result, err := h.ai.Generate(c.Request.Context(), req.Prompt)
	if err != nil {
		if errors.Is(err, ai.ErrUnavailable) {
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
	if err := bindJSON(c, &req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	result, err := h.ai.Summarize(c.Request.Context(), req.Text)
	if err != nil {
		if errors.Is(err, ai.ErrUnavailable) {
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
	if err := bindJSON(c, &req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	tags, err := h.ai.ExtractTags(c.Request.Context(), req.Text, req.MaxTags)
	if err != nil {
		if errors.Is(err, ai.ErrUnavailable) {
			response.Error(c, errcode.ErrAIUnavailable, "ai not configured")
			return
		}
		handleError(c, err)
		return
	}
	existingTags, err := h.fetchExistingTags(c, req.DocumentID)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"tags": tags, "existing_tags": toTagResponses(existingTags)})
}

func (h *AIHandler) Search(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		response.Error(c, errcode.ErrInvalid, "query required")
		return
	}
	page, err := parsePage(c, 4, 20)
	if err != nil || page.Offset != 0 {
		response.Error(c, errcode.ErrInvalid, "invalid pagination")
		return
	}
	excludeID := c.Query("exclude_id")

	userID := getUserID(c)
	docs, scores, err := h.documents.SemanticSearch(
		c.Request.Context(), userID, query, "", nil,
		safeconv.IntToUint(page.Limit), 0, "", excludeID,
	)
	if err != nil {
		handleError(c, err)
		return
	}
	if len(docs) == 0 {
		response.Success(c, gin.H{"items": []any{}})
		return
	}

	type documentWithScore struct {
		documentResponse
		Score float32 `json:"score"`
	}

	results := make([]documentWithScore, 0, len(docs))
	for i, doc := range docs {
		score := float32(0)
		if i < len(scores) {
			score = scores[i]
		}
		results = append(results, documentWithScore{
			documentResponse: toDocumentResponse(doc),
			Score:            score,
		})
	}
	response.Success(c, gin.H{"items": results})
}

func (h *AIHandler) fetchExistingTags(c *gin.Context, documentID string) ([]model.Tag, error) {
	if documentID == "" {
		return nil, nil
	}
	userID := getUserID(c)
	tagIDs, err := h.documents.ListTagIDs(c.Request.Context(), userID, documentID)
	if err != nil {
		return nil, fmt.Errorf("list tag ids: %w", err)
	}
	if len(tagIDs) == 0 {
		return nil, nil
	}
	tags, err := h.tags.ListByIDs(c.Request.Context(), userID, tagIDs)
	if err != nil {
		return nil, fmt.Errorf("list tags: %w", err)
	}
	return tags, nil
}
