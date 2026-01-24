package handler

import (
	"github.com/gin-gonic/gin"

	"mnote/internal/pkg/response"
	"mnote/internal/service"
)

type ShareHandler struct {
	documents *service.DocumentService
}

func NewShareHandler(documents *service.DocumentService) *ShareHandler {
	return &ShareHandler{documents: documents}
}

func (h *ShareHandler) Create(c *gin.Context) {
	share, err := h.documents.CreateShare(c.Request.Context(), getUserID(c), c.Param("id"))
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, share)
}

func (h *ShareHandler) Revoke(c *gin.Context) {
	if err := h.documents.RevokeShare(c.Request.Context(), getUserID(c), c.Param("id")); err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"ok": true})
}

func (h *ShareHandler) PublicGet(c *gin.Context) {
	_, doc, err := h.documents.GetShareByToken(c.Request.Context(), c.Param("token"))
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, doc)
}
