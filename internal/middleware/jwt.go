package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"mnote/internal/pkg/jwt"
	"mnote/internal/pkg/response"
)

const ContextUserIDKey = "user_id"

func JWTAuth(secret []byte) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" {
			response.Error(c, http.StatusUnauthorized, "unauthorized", "missing authorization")
			c.Abort()
			return
		}
		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			response.Error(c, http.StatusUnauthorized, "unauthorized", "invalid authorization")
			c.Abort()
			return
		}
		userID, err := jwt.ParseToken(parts[1], secret)
		if err != nil {
			response.Error(c, http.StatusUnauthorized, "unauthorized", "invalid token")
			c.Abort()
			return
		}
		c.Set(ContextUserIDKey, userID)
		c.Next()
	}
}
