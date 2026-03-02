package handler

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
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

func (h *ExportHandler) ExportDocument(c *gin.Context) {
	format := strings.TrimSpace(c.Query("format"))
	if format == "" {
		format = "markdown"
	}
	content, filename, contentType, err := h.export.ExportDocument(c.Request.Context(), getUserID(c), c.Param("id"), format)
	if err != nil {
		if strings.Contains(err.Error(), "unsupported export format") {
			handleError(c, appErr.ErrInvalid)
			return
		}
		handleError(c, err)
		return
	}
	c.Header("Content-Type", contentType)
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	c.Data(200, contentType, content)
}
