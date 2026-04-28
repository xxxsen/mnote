package handler

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/pkg/errcode"
	"github.com/xxxsen/mnote/internal/pkg/response"
)

type saveTempFileFunc func(name string, r io.Reader) (string, error)

type ImportHandler struct {
	imports       IImportHandlerService
	maxUploadSize int64
	saveTempFile  saveTempFileFunc
}

func NewImportHandler(
	imports IImportHandlerService, maxUploadSize int64, saveTempFile saveTempFileFunc,
) *ImportHandler {
	return &ImportHandler{
		imports: imports, maxUploadSize: maxUploadSize, saveTempFile: saveTempFile,
	}
}

type importConfirmRequest struct {
	Mode string `json:"mode"`
}

type createJobFunc func(ctx context.Context, userID, filePath string) (*model.ImportJob, error)

func (h *ImportHandler) handleZipUpload(c *gin.Context, create createJobFunc) {
	file, err := c.FormFile("file")
	if err != nil {
		response.Error(c, errcode.ErrInvalidFile, "file is required")
		return
	}
	if h.maxUploadSize > 0 && file.Size > h.maxUploadSize {
		response.Error(c, errcode.ErrInvalidFile, "file too large (max "+formatUploadLimit(h.maxUploadSize)+")")
		return
	}
	if strings.ToLower(filepath.Ext(file.Filename)) != ".zip" {
		response.Error(c, errcode.ErrInvalidFile, "zip file required")
		return
	}
	opened, err := file.Open()
	if err != nil {
		response.Error(c, errcode.ErrInvalidFile, "failed to open file")
		return
	}
	defer func() { _ = opened.Close() }()
	tmpPath, err := h.saveTempFile(file.Filename, opened)
	if err != nil {
		response.Error(c, errcode.ErrImportFailed, "failed to read file")
		return
	}
	defer func() { _ = removeFile(tmpPath) }()
	job, err := create(c.Request.Context(), getUserID(c), tmpPath)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"job_id": job.ID})
}

func (h *ImportHandler) HedgeDocUpload(c *gin.Context) {
	h.handleZipUpload(c, h.imports.CreateHedgeDocJob)
}

func (h *ImportHandler) NotesUpload(c *gin.Context) {
	h.handleZipUpload(c, h.imports.CreateNotesJob)
}

func (h *ImportHandler) NotesPreview(c *gin.Context) {
	jobID := c.Param("job_id")
	if jobID == "" {
		response.Error(c, errcode.ErrInvalid, "job_id required")
		return
	}
	preview, err := h.imports.Preview(c.Request.Context(), getUserID(c), jobID)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, preview)
}

func (h *ImportHandler) NotesConfirm(c *gin.Context) {
	jobID := c.Param("job_id")
	if jobID == "" {
		response.Error(c, errcode.ErrInvalid, "job_id required")
		return
	}
	var req importConfirmRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	if err := h.imports.Confirm(c.Request.Context(), getUserID(c), jobID, req.Mode); err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"ok": true})
}

func (h *ImportHandler) NotesStatus(c *gin.Context) {
	h.handleJobStatus(c)
}

func (h *ImportHandler) HedgeDocPreview(c *gin.Context) {
	jobID := c.Param("job_id")
	if jobID == "" {
		response.Error(c, errcode.ErrInvalid, "job_id required")
		return
	}
	preview, err := h.imports.Preview(c.Request.Context(), getUserID(c), jobID)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, preview)
}

func (h *ImportHandler) HedgeDocConfirm(c *gin.Context) {
	jobID := c.Param("job_id")
	if jobID == "" {
		response.Error(c, errcode.ErrInvalid, "job_id required")
		return
	}
	var req importConfirmRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	if err := h.imports.Confirm(c.Request.Context(), getUserID(c), jobID, req.Mode); err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"ok": true})
}

func (h *ImportHandler) HedgeDocStatus(c *gin.Context) {
	h.handleJobStatus(c)
}

func (h *ImportHandler) handleJobStatus(c *gin.Context) {
	jobID := c.Param("job_id")
	if jobID == "" {
		response.Error(c, errcode.ErrInvalid, "job_id required")
		return
	}
	job, err := h.imports.Status(c.Request.Context(), getUserID(c), jobID)
	if err != nil {
		handleError(c, err)
		return
	}
	progress := 0
	if job.Total > 0 {
		progress = int(float64(job.Processed) / float64(job.Total) * 100)
	}
	response.Success(c, gin.H{
		"status":    job.Status,
		"progress":  progress,
		"processed": job.Processed,
		"total":     job.Total,
		"report":    job.Report,
	})
}

func removeFile(path string) error {
	if path == "" {
		return nil
	}
	return osRemove(path)
}

var osRemove = os.Remove
