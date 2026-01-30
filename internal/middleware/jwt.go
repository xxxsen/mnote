package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/xxxsen/mnote/internal/pkg/errcode"
	"github.com/xxxsen/mnote/internal/pkg/jwt"
	"github.com/xxxsen/mnote/internal/pkg/response"
)

const ContextUserIDKey = "user_id"

func JWTAuth(secret []byte) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" {
			response.Error(c, errcode.ErrUnauthorized, "missing authorization")
			c.Abort()
			return
		}
		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
			response.Error(c, errcode.ErrUnauthorized, "invalid authorization")
			c.Abort()
			return
		}
		claims, err := jwt.ParseToken(parts[1], secret)
		if err != nil {
			response.Error(c, errcode.ErrUnauthorized, "invalid token")
			c.Abort()
			return
		}
		c.Set(ContextUserIDKey, claims.UserID)
		if claims.Email != "" {
			c.Set("user_email", claims.Email)
		}
		c.Next()
	}
}
