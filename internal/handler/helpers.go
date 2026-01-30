package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/xxxsen/common/logutil"
	"github.com/xxxsen/common/trace"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/pkg/errcode"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/response"
)

func getUserID(c *gin.Context) string {
	value, _ := c.Get("user_id")
	userID, _ := value.(string)
	return userID
}

func handleError(c *gin.Context, err error) {
	if err != nil {
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
	}
	switch {
	case err == nil:
		return
	case err == appErr.ErrUnauthorized:
		response.Error(c, errcode.ErrUnauthorized, "unauthorized")
	case err == appErr.ErrForbidden:
		response.Error(c, errcode.ErrForbidden, "forbidden")
	case err == appErr.ErrNotFound:
		response.Error(c, errcode.ErrNotFound, "not found")
	case err == appErr.ErrInvalid:
		response.Error(c, errcode.ErrInvalid, "invalid request")
	case err == appErr.ErrConflict:
		response.Error(c, errcode.ErrConflict, "conflict")
	case err == appErr.ErrTooMany:
		response.Error(c, errcode.ErrTooMany, "too many requests")
	default:
		response.Error(c, errcode.ErrInternal, "internal error")
	}
}
