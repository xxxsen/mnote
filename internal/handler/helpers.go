package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/xxxsen/common/logutil"
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
	if err != nil {
		requestID, _ := c.Get("request_id")
		userID, _ := c.Get("user_id")
		logutil.GetLogger(c.Request.Context()).Error(
			"request error",
			zap.Any("request_id", requestID),
			zap.String("method", c.Request.Method),
			zap.String("path", c.Request.URL.Path),
			zap.Any("user_id", userID),
			zap.Error(err),
		)
	}
	switch {
	case err == nil:
		return
	case err == appErr.ErrUnauthorized:
		response.Error(c, http.StatusUnauthorized, "unauthorized", "unauthorized")
	case err == appErr.ErrForbidden:
		response.Error(c, http.StatusForbidden, "forbidden", "forbidden")
	case err == appErr.ErrNotFound:
		response.Error(c, http.StatusNotFound, "not_found", "not found")
	case err == appErr.ErrInvalid:
		response.Error(c, http.StatusBadRequest, "invalid", "invalid request")
	case err == appErr.ErrConflict:
		response.Error(c, http.StatusConflict, "conflict", "conflict")
	default:
		response.Error(c, http.StatusInternalServerError, "internal", "internal error")
	}
}
