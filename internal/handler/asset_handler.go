package handler

import (
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/pkg/errcode"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/response"
	"github.com/xxxsen/mnote/internal/service"
)

type AssetHandler struct {
	assets *service.AssetService
}

func NewAssetHandler(assets *service.AssetService) *AssetHandler {
	return &AssetHandler{assets: assets}
}

func (h *AssetHandler) List(c *gin.Context) {
	query := c.Query("q")
	limit := uint(20)
	offset := uint(0)
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
	items, err := h.assets.List(c.Request.Context(), getUserID(c), query, limit, offset)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, items)
}

func (h *AssetHandler) References(c *gin.Context) {
	items, err := h.assets.ListReferences(c.Request.Context(), getUserID(c), c.Param("id"))
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, items)
}

func (h *AssetHandler) Delete(c *gin.Context) {
	force := c.Query("force") == "1"
	err := h.assets.Delete(c.Request.Context(), getUserID(c), c.Param("id"), force)
	if err != nil {
		if err == appErr.ErrConflict {
			response.Error(c, errcode.ErrConflict, "asset is still referenced by documents")
			return
		}
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"ok": true})
}
