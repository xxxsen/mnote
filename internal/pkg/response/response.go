package response

import (
	"github.com/gin-gonic/gin"
	"github.com/xxxsen/common/webapi/proxyutil"
)

type codeErr struct {
	code uint32
	msg  string
}

func (e codeErr) Error() string {
	return e.msg
}

func (e codeErr) Code() uint32 {
	return e.code
}

func AsCodeErr(code uint32, msg string) error {
	return codeErr{code: code, msg: msg}
}

func Success(c *gin.Context, data interface{}) {
	proxyutil.SuccessJson(c, data)
}

func Error(c *gin.Context, code int, message string) {
	proxyutil.FailJson(c, 200, AsCodeErr(uint32(code), message))
}
