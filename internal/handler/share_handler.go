package handler

import (
	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/pkg/response"
	"github.com/xxxsen/mnote/internal/service"
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

func (h *ShareHandler) GetActive(c *gin.Context) {
	share, err := h.documents.GetActiveShare(c.Request.Context(), getUserID(c), c.Param("id"))
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"share": share})
}

func (h *ShareHandler) PublicGet(c *gin.Context) {
	detail, err := h.documents.GetShareByToken(c.Request.Context(), c.Param("token"))
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, detail)
}

func (h *ShareHandler) List(c *gin.Context) {
	items, err := h.documents.ListSharedDocuments(c.Request.Context(), getUserID(c))
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"items": items})
}
