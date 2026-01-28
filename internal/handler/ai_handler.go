package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/pkg/response"
	"github.com/xxxsen/mnote/internal/service"
)

type AIHandler struct {
	ai *service.AIService
}

func NewAIHandler(ai *service.AIService) *AIHandler {
	return &AIHandler{ai: ai}
}

type aiPolishRequest struct {
	Text string `json:"text"`
}

type aiGenerateRequest struct {
	Prompt string `json:"prompt"`
}

type aiTagsRequest struct {
	Text    string `json:"text"`
	MaxTags int    `json:"max_tags"`
}

func (h *AIHandler) Polish(c *gin.Context) {
	var req aiPolishRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid", "invalid request")
		return
	}
	result, err := h.ai.Polish(c.Request.Context(), req.Text)
	if err != nil {
		if errors.Is(err, service.ErrAIUnavailable) {
			response.Error(c, http.StatusServiceUnavailable, "ai_unavailable", "ai not configured")
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
		response.Error(c, http.StatusBadRequest, "invalid", "invalid request")
		return
	}
	result, err := h.ai.Generate(c.Request.Context(), req.Prompt)
	if err != nil {
		if errors.Is(err, service.ErrAIUnavailable) {
			response.Error(c, http.StatusServiceUnavailable, "ai_unavailable", "ai not configured")
			return
		}
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"text": result})
}

func (h *AIHandler) Tags(c *gin.Context) {
	var req aiTagsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid", "invalid request")
		return
	}
	tags, err := h.ai.ExtractTags(c.Request.Context(), req.Text, req.MaxTags)
	if err != nil {
		if errors.Is(err, service.ErrAIUnavailable) {
			response.Error(c, http.StatusServiceUnavailable, "ai_unavailable", "ai not configured")
			return
		}
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"tags": tags})
}
