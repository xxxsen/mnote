package handler

import (
	"context"
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

type assetUploadStateService interface {
	BeginUpload(
		ctx context.Context,
		userID, fileKey, url, name, contentType string, size int64,
	) error
	CompleteUpload(ctx context.Context, userID, fileKey string) error
	FailUpload(ctx context.Context, userID, fileKey, stableError string) error
}

func NewFileHandler(
	store filestore.Store, maxUploadSize int64, assets ...IAssetHandlerService,
) *FileHandler {
	handler := &FileHandler{store: store, maxUploadSize: maxUploadSize}
	if len(assets) > 0 {
		handler.assets = assets[0]
	}
	return handler
}

func (h *FileHandler) Upload(c *gin.Context) {
	if h.maxUploadSize > 0 {
		c.Request.Body = http.MaxBytesReader(
			c.Writer, c.Request.Body, h.maxUploadSize+(1<<20),
		)
	}
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
	h.persistUpload(
		c, getUserID(c), file.Filename, contentType, file.Size, reader,
	)
}

func (h *FileHandler) persistUpload(
	c *gin.Context, userID, filename, contentType string,
	size int64, reader filestore.ReadSeekCloser,
) {
	key, err := h.store.GenerateFileRef(userID, filename)
	if err != nil {
		logutil.GetLogger(c.Request.Context()).Error(
			"generate upload key failed",
			zap.String("user_id", userID),
			zap.Error(err),
		)
		response.Error(c, errcode.ErrUploadFailed, "failed to upload file")
		return
	}
	fileURL := h.store.PublicURL(key)
	statefulAssets, stateful := h.assets.(assetUploadStateService)
	if stateful {
		if err := statefulAssets.BeginUpload(
			c.Request.Context(), userID, key, fileURL,
			filename, contentType, size,
		); err != nil {
			logutil.GetLogger(c.Request.Context()).Error(
				"create pending asset failed",
				zap.String("user_id", userID),
				zap.String("file_key", key),
				zap.Error(err),
			)
			response.Error(c, errcode.ErrUploadFailed, "failed to upload file")
			return
		}
	}
	if err := h.store.Save(c.Request.Context(), key, reader, size); err != nil {
		if stateful {
			if stateErr := statefulAssets.FailUpload(
				c.Request.Context(), userID, key, "store save failed",
			); stateErr != nil {
				logutil.GetLogger(c.Request.Context()).Error(
					"mark failed asset upload failed",
					zap.String("user_id", userID),
					zap.String("file_key", key),
					zap.Error(stateErr),
				)
			}
		}
		logutil.GetLogger(c.Request.Context()).Error(
			"save uploaded file failed",
			zap.String("user_id", userID),
			zap.String("file_key", key),
			zap.Error(err),
		)
		response.Error(c, errcode.ErrUploadFailed, "failed to upload file")
		return
	}
	if stateful {
		if err := statefulAssets.CompleteUpload(
			c.Request.Context(), userID, key,
		); err != nil {
			h.compensateUpload(c, userID, key, statefulAssets)
			response.Error(c, errcode.ErrUploadFailed, "failed to upload file")
			return
		}
		response.Success(c, UploadResponse{
			URL: fileURL, Name: filename, ContentType: contentType,
		})
		return
	}
	if err := h.recordAsset(c, userID, key, fileURL, filename, contentType, size); err != nil {
		if deleteErr := h.store.Delete(c.Request.Context(), key); deleteErr != nil {
			logutil.GetLogger(c.Request.Context()).Error(
				"asset index and upload compensation failed",
				zap.String("user_id", userID),
				zap.String("file_key", key),
				zap.Error(deleteErr),
			)
		}
		response.Error(c, errcode.ErrUploadFailed, "failed to upload file")
		return
	}
	response.Success(c, UploadResponse{URL: fileURL, Name: filename, ContentType: contentType})
}

func (h *FileHandler) compensateUpload(
	c *gin.Context, userID, key string, assets assetUploadStateService,
) {
	logger := logutil.GetLogger(c.Request.Context())
	if err := assets.FailUpload(
		c.Request.Context(), userID, key, "asset ready transition failed",
	); err != nil {
		logger.Error(
			"mark compensated asset failed",
			zap.String("user_id", userID),
			zap.String("file_key", key),
			zap.Error(err),
		)
	}
	if err := h.store.Delete(c.Request.Context(), key); err != nil {
		logger.Error(
			"asset transition and upload compensation failed",
			zap.String("user_id", userID),
			zap.String("file_key", key),
			zap.Error(err),
		)
	}
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
