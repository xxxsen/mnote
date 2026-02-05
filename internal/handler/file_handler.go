package handler

import (
	"errors"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/filestore"
	"github.com/xxxsen/mnote/internal/middleware"
	"github.com/xxxsen/mnote/internal/pkg/errcode"
	"github.com/xxxsen/mnote/internal/pkg/response"
)

type FileHandler struct {
	store         filestore.Store
	maxUploadSize int64
}

type UploadResponse struct {
	URL         string `json:"url"`
	Name        string `json:"name"`
	ContentType string `json:"content_type"`
}

func NewFileHandler(store filestore.Store, maxUploadSize int64) *FileHandler {
	return &FileHandler{store: store, maxUploadSize: maxUploadSize}
}

func (h *FileHandler) Upload(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		response.Error(c, errcode.ErrInvalidFile, "file is required")
		return
	}
	if h.maxUploadSize > 0 && file.Size > h.maxUploadSize {
		response.Error(c, errcode.ErrInvalidFile, "file too large (max "+formatUploadLimit(h.maxUploadSize)+")")
		return
	}
	opened, err := file.Open()
	if err != nil {
		response.Error(c, errcode.ErrInvalidFile, "failed to open file")
		return
	}

	reader, contentType, err := ensureReadSeekCloser(opened)
	if err != nil {
		response.Error(c, errcode.ErrInvalidFile, "failed to read file")
		return
	}
	defer reader.Close()

	if contentType == "application/octet-stream" {
		if extType := mime.TypeByExtension(filepath.Ext(file.Filename)); extType != "" {
			contentType = extType
		}
	}

	userID := ""
	if v, ok := c.Get(middleware.ContextUserIDKey); ok {
		if id, ok := v.(string); ok {
			userID = id
		}
	}

	key := h.store.GenerateFileRef(userID, file.Filename)
	if err := h.store.Save(c.Request.Context(), key, reader, file.Size); err != nil {
		response.Error(c, errcode.ErrUploadFailed, "failed to upload file")
		return
	}
	fileURL := key
	if !strings.HasPrefix(fileURL, "http://") && !strings.HasPrefix(fileURL, "https://") {
		fileURL = "/api/v1/files/" + key
	}
	response.Success(c, UploadResponse{
		URL:         fileURL,
		Name:        file.Filename,
		ContentType: contentType,
	})
}

func (h *FileHandler) Get(c *gin.Context) {
	key := c.Param("key")
	if key == "" || strings.Contains(key, "/") || strings.Contains(key, "\\") {
		c.Status(http.StatusBadRequest)
		return
	}
	file, err := h.store.Open(c.Request.Context(), key)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	defer file.Close()
	contentType := mime.TypeByExtension(filepath.Ext(key))
	if contentType == "" || contentType == "application/octet-stream" {
		if seeker, ok := file.(io.ReadSeeker); ok {
			buf := make([]byte, 512)
			n, _ := seeker.Read(buf)
			if n > 0 {
				detected := http.DetectContentType(buf[:n])
				if detected != "application/octet-stream" {
					contentType = detected
				}
			}
			_, _ = seeker.Seek(0, io.SeekStart)
		}
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	c.Header("Content-Type", contentType)
	c.Header("X-Content-Type-Options", "nosniff")
	isInline := contentType == "image/png" ||
		contentType == "image/jpeg" ||
		contentType == "image/gif" ||
		contentType == "image/webp" ||
		strings.HasPrefix(contentType, "video/") ||
		strings.HasPrefix(contentType, "audio/")

	if !isInline {
		c.Header("Content-Disposition", "attachment; filename="+key)
	}
	_, _ = io.Copy(c.Writer, file)
}

func ensureReadSeekCloser(file filestore.ReadSeekCloser) (filestore.ReadSeekCloser, string, error) {
	buf := make([]byte, 512)
	read, err := file.Read(buf)
	if err != nil && !errors.Is(err, io.EOF) {
		return nil, "", err
	}
	contentType := http.DetectContentType(buf[:read])
	if _, err := file.Seek(0, 0); err != nil {
		return nil, "", err
	}
	return file, contentType, nil
}
