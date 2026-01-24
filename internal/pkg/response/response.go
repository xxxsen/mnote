package response

import "github.com/gin-gonic/gin"

type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func Success(c *gin.Context, data interface{}) {
	c.JSON(200, gin.H{"data": data})
}

func Error(c *gin.Context, status int, code, message string) {
	c.JSON(status, gin.H{"error": APIError{Code: code, Message: message}})
}
