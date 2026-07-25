package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/xxxsen/common/logutil"
	"github.com/xxxsen/common/trace"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/ai"
	"github.com/xxxsen/mnote/internal/middleware"
	"github.com/xxxsen/mnote/internal/pkg/errcode"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/response"
	"github.com/xxxsen/mnote/internal/service"
)

const (
	defaultMaxJSONBodySize    int64 = 2 * 1024 * 1024
	maxJSONBodySizeContextKey       = "max_json_body_size"
)

var errMultipleJSONValues = errors.New("multiple JSON values are not allowed")

func getUserID(c *gin.Context) string {
	value, _ := c.Get(middleware.ContextUserIDKey)
	userID, _ := value.(string)
	return userID
}

func parsePage(c *gin.Context, defaultLimit, maxLimit int) (service.Page, error) {
	page := service.Page{Limit: defaultLimit}
	if raw, exists := c.GetQuery("limit"); exists {
		value, err := strconv.Atoi(raw)
		if err != nil || value <= 0 || value > maxLimit {
			return service.Page{}, appErr.ErrInvalid
		}
		page.Limit = value
	}
	if raw, exists := c.GetQuery("offset"); exists {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 0 {
			return service.Page{}, appErr.ErrInvalid
		}
		page.Offset = value
	}
	return page, nil
}

func bindJSON(c *gin.Context, target any) error {
	maxBodySize := defaultMaxJSONBodySize
	if configured, exists := c.Get(maxJSONBodySizeContextKey); exists {
		if value, ok := configured.(int64); ok && value > 0 {
			maxBodySize = value
		}
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBodySize)
	decoder := json.NewDecoder(c.Request.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("decode JSON body: %w", err)
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return errMultipleJSONValues
		}
		return fmt.Errorf("decode trailing JSON body: %w", err)
	}
	return nil
}

func handleError(c *gin.Context, err error) {
	if err == nil {
		return
	}
	_, _, providerError := ai.ErrorDetails(err)
	if errors.Is(err, ai.ErrUnavailable) || providerError {
		response.Error(c, errcode.ErrAIUnavailable, "ai unavailable")
		return
	}

	requestID, _ := trace.GetTraceId(c.Request.Context())
	userID, _ := c.Get(middleware.ContextUserIDKey)
	logger := logutil.GetLogger(c.Request.Context()).With(
		zap.Any("request_id", requestID),
		zap.String("method", c.Request.Method),
		zap.String("operation", c.FullPath()),
		zap.Any("user_id", userID),
	)

	normalized := appErr.Normalize(err)
	switch normalized.Code() {
	case errcode.ErrInvalid, errcode.ErrNotFound:
		logger.Debug("request rejected", zap.Uint32("error_code", normalized.Code()))
	case errcode.ErrConflict, errcode.ErrForbidden, errcode.ErrTooMany:
		logger.Warn("request rejected", zap.Uint32("error_code", normalized.Code()))
	default:
		logger.Error(
			"request failed",
			zap.Uint32("error_code", normalized.Code()),
			zap.Error(err),
		)
	}
	response.Error(c, normalized.Code(), normalized.Message())
}
