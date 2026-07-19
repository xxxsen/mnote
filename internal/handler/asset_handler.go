package handler

import (
	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/pkg/errcode"
	"github.com/xxxsen/mnote/internal/pkg/response"
	"github.com/xxxsen/mnote/internal/pkg/safeconv"
)

type AssetHandler struct {
	assets IAssetHandlerService
}

func NewAssetHandler(assets IAssetHandlerService) *AssetHandler {
	return &AssetHandler{assets: assets}
}

func (h *AssetHandler) List(c *gin.Context) {
	query := c.Query("q")
	page, err := parsePage(c, 20, 200)
	if err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid pagination")
		return
	}
	items, err := h.assets.List(
		c.Request.Context(), getUserID(c), query,
		safeconv.IntToUint(page.Limit), safeconv.IntToUint(page.Offset),
	)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, toAssetListResponses(items))
}

func (h *AssetHandler) References(c *gin.Context) {
	items, err := h.assets.ListReferences(c.Request.Context(), getUserID(c), c.Param("id"))
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, items)
}
