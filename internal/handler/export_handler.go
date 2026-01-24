package handler

import (
	"github.com/gin-gonic/gin"

	"mnote/internal/pkg/response"
	"mnote/internal/service"
)

type ExportHandler struct {
	export *service.ExportService
}

func NewExportHandler(export *service.ExportService) *ExportHandler {
	return &ExportHandler{export: export}
}

func (h *ExportHandler) Export(c *gin.Context) {
	payload, err := h.export.Export(c.Request.Context(), getUserID(c))
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, payload)
}
