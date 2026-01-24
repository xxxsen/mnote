package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	appErr "mnote/internal/pkg/errors"
	"mnote/internal/pkg/response"
)

func getUserID(c *gin.Context) string {
	value, _ := c.Get("user_id")
	userID, _ := value.(string)
	return userID
}

func handleError(c *gin.Context, err error) {
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
