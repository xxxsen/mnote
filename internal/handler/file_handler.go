package handler

import (
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/xxxsen/common/logutil"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/filestore"

	"github.com/xxxsen/mnote/internal/pkg/errcode"
	"github.com/xxxsen/mnote/internal/pkg/response"
)

type FileHandler struct {
	store         filestore.Store
	maxUploadSize int64
	assets        IAssetHandlerService
}

type UploadResponse struct {
	URL         string `json:"url"`
	Name        string `json:"name"`
	ContentType string `json:"content_type"`
}

func NewFileHandler(store filestore.Store, maxUploadSize int64) *FileHandler {
	return &FileHandler{store: store, maxUploadSize: maxUploadSize}
}

func (h *FileHandler) SetAssetService(assets IAssetHandlerService) {
	h.assets = assets
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
		_ = opened.Close()
		response.Error(c, errcode.ErrInvalidFile, "failed to read file")
		return
	}
	defer func() { _ = reader.Close() }()
	contentType = resolveContentType(contentType, file.Filename)
	userID := getUserID(c)
	key := h.store.GenerateFileRef(userID, file.Filename)
	if err := h.store.Save(c.Request.Context(), key, reader, file.Size); err != nil {
		response.Error(c, errcode.ErrUploadFailed, "failed to upload file")
		return
	}
	fileURL := resolveFileURL(key)
	if err := h.recordAsset(c, userID, key, fileURL, file.Filename, contentType, file.Size); err != nil {
		response.Error(c, errcode.ErrUploadFailed, "upload succeeded but failed to index asset")
		return
	}
	response.Success(c, UploadResponse{URL: fileURL, Name: file.Filename, ContentType: contentType})
}

func resolveContentType(contentType, filename string) string {
	if contentType == "application/octet-stream" {
		if extType := mime.TypeByExtension(filepath.Ext(filename)); extType != "" {
			return extType
		}
	}
	return contentType
}

func resolveFileURL(key string) string {
	if strings.HasPrefix(key, "http://") || strings.HasPrefix(key, "https://") {
		return key
	}
	return "/api/v1/files/" + key
}

func (h *FileHandler) recordAsset(
	c *gin.Context, userID, key, fileURL, filename, contentType string, size int64,
) error {
	if h.assets == nil || userID == "" {
		return nil
	}
	if err := h.assets.RecordUpload(c.Request.Context(), userID, key, fileURL, filename, contentType, size); err != nil {
		logutil.GetLogger(c.Request.Context()).Error(
			"record asset upload failed",
			zap.String("user_id", userID),
			zap.String("file_key", key),
			zap.String("file_name", filename),
			zap.Error(err),
		)
		return fmt.Errorf("record upload: %w", err)
	}
	return nil
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
	defer func() { _ = file.Close() }()
	contentType := detectContentType(key, file)
	c.Header("Content-Type", contentType)
	c.Header("X-Content-Type-Options", "nosniff")
	isInline := contentType == "image/png" ||
		contentType == "image/jpeg" ||
		contentType == "image/gif" ||
		contentType == "image/webp" ||
		strings.HasPrefix(contentType, "video/") ||
		strings.HasPrefix(contentType, "audio/")

	if !isInline {
		c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, key))
	}
	_, _ = io.Copy(c.Writer, file)
}

func detectContentType(key string, file io.ReadCloser) string {
	ct := mime.TypeByExtension(filepath.Ext(key))
	if ct != "" && ct != "application/octet-stream" {
		return ct
	}
	seeker, ok := file.(io.ReadSeeker)
	if !ok {
		return fallbackContentType(ct)
	}
	buf := make([]byte, 512)
	n, _ := seeker.Read(buf)
	_, _ = seeker.Seek(0, io.SeekStart)
	if n > 0 {
		detected := http.DetectContentType(buf[:n])
		if detected != "application/octet-stream" {
			return detected
		}
	}
	return fallbackContentType(ct)
}

func fallbackContentType(ct string) string {
	if ct == "" {
		return "application/octet-stream"
	}
	return ct
}

func ensureReadSeekCloser(file filestore.ReadSeekCloser) (filestore.ReadSeekCloser, string, error) {
	buf := make([]byte, 512)
	read, err := file.Read(buf)
	if err != nil && !errors.Is(err, io.EOF) {
		return nil, "", fmt.Errorf("read header: %w", err)
	}
	contentType := http.DetectContentType(buf[:read])
	if _, err := file.Seek(0, 0); err != nil {
		return nil, "", fmt.Errorf("seek: %w", err)
	}
	return file, contentType, nil
}
