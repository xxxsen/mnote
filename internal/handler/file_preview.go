package handler

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/xxxsen/common/logutil"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/filestore"
)

const (
	maxPDFPreviewBytes = int64(25 * 1024 * 1024)
	pdfSecurityPolicy  = "sandbox; default-src 'none'; object-src 'none'; frame-ancestors 'none'"
)

var (
	errInvalidByteRange   = errors.New("invalid byte range")
	errEmptyPreviewObject = errors.New("preview object is empty")
)

func (h *FileHandler) Preview(c *gin.Context) {
	key := c.Param("key")
	if err := validateFileKey(key); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}

	info, err := h.store.Stat(c.Request.Context(), key)
	if err != nil {
		h.handleFileStoreError(c, "asset preview stat failed", key, err)
		return
	}
	if info.Size == 0 {
		c.Status(http.StatusUnsupportedMediaType)
		return
	}

	contentType, err := detectPreviewContentType(
		c.Request.Context(), h.store, key, info.Size,
	)
	if err != nil {
		h.handleFileStoreError(c, "asset preview sniff failed", key, err)
		return
	}
	if !isPreviewContentType(contentType) {
		c.Status(http.StatusUnsupportedMediaType)
		return
	}
	if contentType == "application/pdf" && info.Size > maxPDFPreviewBytes {
		c.Status(http.StatusRequestEntityTooLarge)
		return
	}

	setPreviewCommonHeaders(c, key, contentType)
	if c.Request.Method == http.MethodHead {
		c.Header("Content-Length", strconv.FormatInt(info.Size, 10))
		c.Status(http.StatusOK)
		return
	}

	byteRange, hasByteRange, err := parseSingleByteRange(c.GetHeader("Range"), info.Size)
	if err != nil {
		c.Header("Content-Range", fmt.Sprintf("bytes */%d", info.Size))
		c.Status(http.StatusRequestedRangeNotSatisfiable)
		return
	}

	var (
		body          io.ReadCloser
		contentLength = info.Size
		status        = http.StatusOK
	)
	if !hasByteRange {
		body, err = h.store.Open(c.Request.Context(), key)
	} else {
		body, err = h.store.OpenRange(c.Request.Context(), key, byteRange)
		contentLength = byteRange.End - byteRange.Start + 1
		status = http.StatusPartialContent
		c.Header(
			"Content-Range",
			fmt.Sprintf("bytes %d-%d/%d", byteRange.Start, byteRange.End, info.Size),
		)
	}
	if err != nil {
		clearPreviewHeaders(c)
		h.handleFileStoreError(c, "asset preview open failed", key, err)
		return
	}
	defer func() { _ = body.Close() }()

	c.Header("Content-Length", strconv.FormatInt(contentLength, 10))
	c.Status(status)
	written, copyErr := copyWithContext(c.Request.Context(), c.Writer, body)
	if copyErr != nil {
		logFileStreamError(c, "asset preview stream failed", key, written, copyErr)
	}
}

func validateFileKey(key string) error {
	if err := filestore.ValidateFileKey(key); err != nil {
		return fmt.Errorf("validate file key: %w", err)
	}
	return nil
}

func detectPreviewContentType(
	ctx context.Context,
	store filestore.Store,
	key string,
	size int64,
) (string, error) {
	if size <= 0 {
		return "", errEmptyPreviewObject
	}
	headerLength := min(size, 512)
	body, err := store.OpenRange(ctx, key, filestore.ByteRange{
		Start: 0,
		End:   headerLength - 1,
	})
	if err != nil {
		return "", fmt.Errorf("open preview header: %w", err)
	}
	defer func() { _ = body.Close() }()

	header := make([]byte, headerLength)
	if _, err := io.ReadFull(body, header); err != nil {
		return "", fmt.Errorf("read preview header: %w", err)
	}
	contentType := normalizeMediaType(http.DetectContentType(header))
	if contentType == "application/octet-stream" {
		contentType = previewTypeByExtension(filepath.Ext(key))
	}
	if contentType == "application/ogg" {
		switch strings.ToLower(filepath.Ext(key)) {
		case ".ogv":
			contentType = "video/ogg"
		case ".ogg", ".oga":
			contentType = "audio/ogg"
		default:
			return "", nil
		}
	}
	return contentType, nil
}

func previewTypeByExtension(extension string) string {
	extension = strings.ToLower(extension)
	fallbacks := map[string]string{
		".mp4":  "video/mp4",
		".webm": "video/webm",
		".ogv":  "video/ogg",
		".mov":  "video/quicktime",
		".mp3":  "audio/mpeg",
		".wav":  "audio/wav",
		".ogg":  "audio/ogg",
		".oga":  "audio/ogg",
		".m4a":  "audio/mp4",
		".aac":  "audio/aac",
		".flac": "audio/flac",
	}
	if fallback, ok := fallbacks[extension]; ok {
		if detected := normalizeMediaType(mime.TypeByExtension(extension)); detected != "" &&
			(strings.HasPrefix(detected, "video/") || strings.HasPrefix(detected, "audio/")) {
			return detected
		}
		return fallback
	}
	return ""
}

func normalizeMediaType(value string) string {
	if index := strings.IndexByte(value, ';'); index >= 0 {
		value = value[:index]
	}
	return strings.ToLower(strings.TrimSpace(value))
}

func isPreviewContentType(contentType string) bool {
	return contentType == "application/pdf" ||
		strings.HasPrefix(contentType, "video/") ||
		strings.HasPrefix(contentType, "audio/")
}

func parseSingleByteRange(value string, size int64) (filestore.ByteRange, bool, error) {
	if value == "" {
		return filestore.ByteRange{}, false, nil
	}
	if size <= 0 || !strings.HasPrefix(value, "bytes=") || strings.Contains(value, ",") {
		return filestore.ByteRange{}, false, errInvalidByteRange
	}
	spec := strings.TrimPrefix(value, "bytes=")
	if spec == "" || strings.ContainsAny(spec, " \t") {
		return filestore.ByteRange{}, false, errInvalidByteRange
	}
	parts := strings.Split(spec, "-")
	if len(parts) != 2 {
		return filestore.ByteRange{}, false, errInvalidByteRange
	}
	if parts[0] == "" {
		byteRange, err := parseSuffixByteRange(parts[1], size)
		return byteRange, err == nil, err
	}

	byteRange, err := parseBoundedByteRange(parts[0], parts[1], size)
	return byteRange, err == nil, err
}

func parseSuffixByteRange(value string, size int64) (filestore.ByteRange, error) {
	suffixLength, err := parseRangeInteger(value)
	if err != nil || suffixLength <= 0 {
		return filestore.ByteRange{}, errInvalidByteRange
	}
	if suffixLength > size {
		suffixLength = size
	}
	return filestore.ByteRange{
		Start: size - suffixLength,
		End:   size - 1,
	}, nil
}

func parseBoundedByteRange(startValue, endValue string, size int64) (filestore.ByteRange, error) {
	start, err := parseRangeInteger(startValue)
	if err != nil || start < 0 || start >= size {
		return filestore.ByteRange{}, errInvalidByteRange
	}
	end := size - 1
	if endValue != "" {
		end, err = parseRangeInteger(endValue)
		if err != nil || end < start {
			return filestore.ByteRange{}, errInvalidByteRange
		}
		if end >= size {
			end = size - 1
		}
	}
	return filestore.ByteRange{Start: start, End: end}, nil
}

func parseRangeInteger(value string) (int64, error) {
	if value == "" {
		return 0, errInvalidByteRange
	}
	for _, character := range value {
		if character < '0' || character > '9' {
			return 0, errInvalidByteRange
		}
	}
	result, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return 0, errInvalidByteRange
	}
	return result, nil
}

func setPreviewCommonHeaders(c *gin.Context, key, contentType string) {
	c.Header("Content-Type", contentType)
	c.Header("Accept-Ranges", "bytes")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Cache-Control", "private, no-transform")
	disposition := "inline"
	if contentType == "application/pdf" {
		disposition = "attachment"
		setPDFSecurityHeaders(c)
	}
	c.Header("Content-Disposition", fmt.Sprintf(`%s; filename="%s"`, disposition, key))
}

func clearPreviewHeaders(c *gin.Context) {
	for _, header := range []string{
		"Accept-Ranges",
		"Cache-Control",
		"Content-Disposition",
		"Content-Length",
		"Content-Range",
		"Content-Security-Policy",
		"Content-Type",
		"X-Content-Type-Options",
	} {
		c.Writer.Header().Del(header)
	}
}

func setPDFSecurityHeaders(c *gin.Context) {
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Security-Policy", pdfSecurityPolicy)
	c.Header("Cache-Control", "private, no-transform")
}

func fileStoreStatus(err error) int {
	switch {
	case errors.Is(err, filestore.ErrInvalidFileKey):
		return http.StatusBadRequest
	case errors.Is(err, filestore.ErrObjectNotFound):
		return http.StatusNotFound
	default:
		return http.StatusInternalServerError
	}
}

func (h *FileHandler) handleFileStoreError(
	c *gin.Context, message, key string, err error,
) {
	status := fileStoreStatus(err)
	if status == http.StatusInternalServerError {
		logutil.GetLogger(c.Request.Context()).Error(
			message,
			zap.String("request_id", c.GetString("request_id")),
			zap.String("file_key", key),
			zap.Int("http_status", status),
			zap.Error(err),
		)
	}
	c.Status(status)
}

func copyWithContext(ctx context.Context, destination io.Writer, source io.Reader) (int64, error) {
	buffer := make([]byte, 32*1024)
	var written int64
	for {
		if err := ctx.Err(); err != nil {
			return written, fmt.Errorf("stream context: %w", err)
		}
		read, readErr := source.Read(buffer)
		if read > 0 {
			count, writeErr := destination.Write(buffer[:read])
			written += int64(count)
			if writeErr != nil {
				return written, fmt.Errorf("write stream: %w", writeErr)
			}
			if count != read {
				return written, fmt.Errorf("write stream: %w", io.ErrShortWrite)
			}
		}
		if readErr != nil {
			if errors.Is(readErr, io.EOF) {
				return written, nil
			}
			return written, fmt.Errorf("read stream: %w", readErr)
		}
	}
}

func logFileStreamError(
	c *gin.Context, message, key string, written int64, err error,
) {
	logutil.GetLogger(c.Request.Context()).Warn(
		message,
		zap.String("request_id", c.GetString("request_id")),
		zap.String("file_key", key),
		zap.Int64("written_bytes", written),
		zap.Error(err),
	)
}
