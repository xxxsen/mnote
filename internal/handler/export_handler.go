package handler

import (
	"fmt"
	"os"
	"time"

	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/pkg/response"
	"github.com/xxxsen/mnote/internal/service"
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

func (h *ExportHandler) ExportNotes(c *gin.Context) {
	path, err := h.export.ExportNotesZip(c.Request.Context(), getUserID(c))
	if err != nil {
		handleError(c, err)
		return
	}
	defer func() {
		_ = os.Remove(path)
	}()
	fileName := fmt.Sprintf("mnote-notes-%s.zip", time.Now().Format("20060102-150405"))
	c.FileAttachment(path, fileName)
}
