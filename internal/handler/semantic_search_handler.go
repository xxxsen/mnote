package handler

import (
	"strings"

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
	query := strings.TrimSpace(c.Query("q"))
	if query == "" {
		response.Error(c, errcode.ErrInvalid, "query required")
		return
	}
	page, err := parsePage(c, 4, 20)
	if err != nil || page.Offset != 0 {
		response.Error(c, errcode.ErrInvalid, "invalid pagination")
		return
	}

	results, err := h.documents.SemanticSearchDetailed(
		c.Request.Context(),
		getUserID(c),
		query,
		safeconv.IntToUint(page.Limit),
		c.Query("exclude_id"),
	)
	if err != nil {
		handleError(c, err)
		return
	}
	if len(results) == 0 {
		response.Success(c, gin.H{"items": []any{}})
		return
	}

	type documentWithScore struct {
		documentResponse
		Score          float32 `json:"score"`
		MatchedExcerpt string  `json:"matched_excerpt"`
		MatchType      string  `json:"match_type"`
	}

	items := make([]documentWithScore, 0, len(results))
	for _, result := range results {
		items = append(items, documentWithScore{
			documentResponse: toDocumentResponse(result.Document),
			Score:            result.Score,
			MatchedExcerpt:   result.MatchedExcerpt,
			MatchType:        result.MatchType,
		})
	}
	response.Success(c, gin.H{"items": items})
}
