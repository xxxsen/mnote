package handler

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/url"
	"path"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/config"
	"github.com/xxxsen/mnote/internal/filestore"
	"github.com/xxxsen/mnote/internal/middleware"
	"github.com/xxxsen/mnote/internal/pkg/response"
)

type FileHandler struct {
	store  filestore.Store
	config config.FileStoreConfig
}

type UploadResponse struct {
	URL         string `json:"url"`
	Name        string `json:"name"`
	ContentType string `json:"content_type"`
}

func NewFileHandler(store filestore.Store, cfg config.FileStoreConfig) *FileHandler {
	return &FileHandler{store: store, config: cfg}
}

func (h *FileHandler) Upload(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		response.Error(c, http.StatusBadRequest, "invalid_file", "file is required")
		return
	}
	opened, err := file.Open()
	if err != nil {
		response.Error(c, http.StatusBadRequest, "invalid_file", "failed to open file")
		return
	}

	reader, contentType, err := ensureReadSeekCloser(opened)
	if err != nil {
		response.Error(c, http.StatusBadRequest, "invalid_file", "failed to read file")
		return
	}
	defer reader.Close()

	userID := ""
	if v, ok := c.Get(middleware.ContextUserIDKey); ok {
		if id, ok := v.(string); ok {
			userID = id
		}
	}

	key := buildFileKey(userID, file.Filename)
	if err := h.store.Save(c.Request.Context(), key, reader, file.Size); err != nil {
		response.Error(c, http.StatusInternalServerError, "upload_failed", "failed to upload file")
		return
	}
	fileURL := h.buildFileURL(c, key)
	response.Success(c, UploadResponse{
		URL:         fileURL,
		Name:        file.Filename,
		ContentType: contentType,
	})
}

func (h *FileHandler) Get(c *gin.Context) {
	if h.store.Type() != "local" {
		c.Status(http.StatusNotFound)
		return
	}
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
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	c.Header("Content-Type", contentType)
	_, _ = file.Seek(0, 0)
	_, _ = io.Copy(c.Writer, file)
}

func (h *FileHandler) buildFileURL(c *gin.Context, key string) string {
	key = strings.TrimPrefix(key, "/")
	switch h.config.Type {
	case "s3":
		base := strings.TrimSuffix(h.config.S3.PublicURL, "/")
		if base == "" {
			base = buildS3BaseURL(h.config.S3)
		}
		objectKey := key
		if h.config.S3.Prefix != "" {
			objectKey = path.Join(h.config.S3.Prefix, key)
		}
		return strings.TrimSuffix(base, "/") + "/" + strings.TrimPrefix(objectKey, "/")
	default:
		base := strings.TrimSuffix(h.config.PublicURL, "/")
		if base == "" {
			base = requestBaseURL(c) + "/api/v1/files"
		}
		return strings.TrimSuffix(base, "/") + "/" + key
	}
}

func buildS3BaseURL(cfg config.S3Config) string {
	ep := cfg.Endpoint
	if !strings.HasPrefix(ep, "http://") && !strings.HasPrefix(ep, "https://") {
		scheme := "http"
		if cfg.UseSSL {
			scheme = "https"
		}
		ep = scheme + "://" + ep
	}
	u, err := url.Parse(ep)
	if err != nil {
		return strings.TrimSuffix(ep, "/") + "/" + cfg.Bucket
	}
	u.Path = strings.TrimSuffix(u.Path, "/") + "/" + cfg.Bucket
	return u.String()
}

func requestBaseURL(c *gin.Context) string {
	proto := c.GetHeader("X-Forwarded-Proto")
	if proto == "" {
		if c.Request.TLS != nil {
			proto = "https"
		} else {
			proto = "http"
		}
	}
	host := c.GetHeader("X-Forwarded-Host")
	if host == "" {
		host = c.Request.Host
	}
	return proto + "://" + host
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

func buildFileKey(userID, filename string) string {
	ext := strings.ToLower(filepath.Ext(filename))
	base := randomHex(8)
	if userID != "" {
		base = userID + "_" + base
	}
	if ext == "" {
		return base
	}
	return base + ext
}

func randomHex(size int) string {
	if size <= 0 {
		return ""
	}
	buf := make([]byte, size)
	_, err := rand.Read(buf)
	if err != nil {
		return ""
	}
	return hex.EncodeToString(buf)
}
