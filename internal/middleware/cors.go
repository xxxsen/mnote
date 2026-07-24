package middleware

import (
	"strings"

	"github.com/gin-gonic/gin"
)

func CORS(allowlist []string) gin.HandlerFunc {
	allowed := make(map[string]struct{}, len(allowlist))
	for _, origin := range allowlist {
		trimmed := strings.TrimSpace(origin)
		if trimmed == "" {
			continue
		}
		allowed[trimmed] = struct{}{}
	}
	allowAll := len(allowed) == 0
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if allowAll {
			c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
			setCORSResponseHeaders(c)
		} else if origin != "" {
			if _, ok := allowed[origin]; ok {
				c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
				c.Writer.Header().Set("Vary", "Origin")
				setCORSResponseHeaders(c)
			}
		}
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

func setCORSResponseHeaders(c *gin.Context) {
	c.Writer.Header().Set(
		"Access-Control-Allow-Methods",
		"GET, HEAD, POST, PUT, DELETE, OPTIONS",
	)
	c.Writer.Header().Set(
		"Access-Control-Allow-Headers",
		"Authorization, Content-Type, X-Request-Id",
	)
	c.Writer.Header().Set(
		"Access-Control-Expose-Headers",
		"Accept-Ranges, Content-Length, Content-Range, Content-Type",
	)
}
