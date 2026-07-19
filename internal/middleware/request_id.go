package middleware

import (
	"crypto/rand"
	"encoding/hex"
	"regexp"

	"github.com/gin-gonic/gin"
)

var requestIDPattern = regexp.MustCompile(`^[A-Za-z0-9._:-]{1,64}$`)

func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		reqID := c.GetHeader("X-Request-Id")
		if !requestIDPattern.MatchString(reqID) {
			reqID = newRequestID()
		}
		c.Writer.Header().Set("X-Request-Id", reqID)
		c.Set("request_id", reqID)
		c.Next()
	}
}

func newRequestID() string {
	bytes := make([]byte, 16)
	_, _ = rand.Read(bytes)
	return hex.EncodeToString(bytes)
}
