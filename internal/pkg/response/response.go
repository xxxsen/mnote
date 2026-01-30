package response

import "github.com/gin-gonic/gin"

type APIResponse struct {
	Code int         `json:"code"`
	Msg  string      `json:"msg"`
	Data interface{} `json:"data,omitempty"`
}

func Success(c *gin.Context, data interface{}) {
	c.JSON(200, APIResponse{Code: 0, Msg: "ok", Data: data})
}

func Error(c *gin.Context, code int, message string) {
	c.JSON(200, APIResponse{Code: code, Msg: message})
}
