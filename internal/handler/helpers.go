package handler

import (
	stderrors "errors"

	"github.com/gin-gonic/gin"
	"github.com/xxxsen/common/logutil"
	"github.com/xxxsen/common/trace"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/middleware"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/response"
)

func getUserID(c *gin.Context) string {
	value, _ := c.Get(middleware.ContextUserIDKey)
	userID, _ := value.(string)
	return userID
}

func handleError(c *gin.Context, err error) {
	if err == nil {
		return
	}

	requestID, _ := trace.GetTraceId(c.Request.Context())
	userID, _ := c.Get(middleware.ContextUserIDKey)
	userEmail, _ := c.Get(middleware.ContextUserEmailKey)
	logutil.GetLogger(c.Request.Context()).Error(
		"request error",
		zap.Any("request_id", requestID),
		zap.String("method", c.Request.Method),
		zap.String("path", c.Request.URL.Path),
		zap.Any("user_id", userID),
		zap.Any("user_email", userEmail),
		zap.Error(err),
	)

	var conflict *appErr.ConflictError
	if stderrors.As(err, &conflict) {
		response.ErrorWithData(c, conflict.Code(), conflict.Message(), gin.H{
			"current": conflict.Current,
		})
		return
	}

	normalized := appErr.Normalize(err)
	response.Error(c, normalized.Code(), normalized.Message())
}
