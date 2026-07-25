package handler

import (
	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/pkg/errcode"
	"github.com/xxxsen/mnote/internal/pkg/response"
	"github.com/xxxsen/mnote/internal/pkg/safeconv"
)

type SemanticSearchHandler struct {
	documents ISemanticSearchHandlerService
}

func NewSemanticSearchHandler(documents ISemanticSearchHandlerService) *SemanticSearchHandler {
	return &SemanticSearchHandler{documents: documents}
}

func (h *SemanticSearchHandler) Search(c *gin.Context) {
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

	docs, scores, err := h.documents.SemanticSearch(
		c.Request.Context(), getUserID(c), query, "", nil,
		safeconv.IntToUint(page.Limit), 0, "", c.Query("exclude_id"),
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
