package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/xxxsen/common/logutil"
	"github.com/xxxsen/common/trace"
	"go.uber.org/zap"

	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/response"
)

func getUserID(c *gin.Context) string {
	value, _ := c.Get("user_id")
	userID, _ := value.(string)
	return userID
}

func handleError(c *gin.Context, err error) {
	if err == nil {
		return
	}

	requestID, _ := trace.GetTraceId(c.Request.Context())
	userID, _ := c.Get("user_id")
	userEmail, _ := c.Get("user_email")
	logutil.GetLogger(c.Request.Context()).Error(
		"request error",
		zap.Any("request_id", requestID),
		zap.String("method", c.Request.Method),
		zap.String("path", c.Request.URL.Path),
		zap.Any("user_id", userID),
		zap.Any("user_email", userEmail),
		zap.Error(err),
	)

	normalized := appErr.Normalize(err)
	response.Error(c, normalized.Code(), normalized.Message())
}
