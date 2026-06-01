package response

import (
	"net/http"

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

// CommonResponse is intentionally re-declared here so that ErrorWithData can
// emit the same wire format as proxyutil.SuccessJson/FailJson without
// importing the proxyutil private packet builder.
type CommonResponse struct {
	Code    uint32 `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data"`
}

func Success(c *gin.Context, data any) {
	proxyutil.SuccessJson(c, data)
}

func Error(c *gin.Context, code uint32, message string) {
	proxyutil.FailJson(c, 200, AsCodeErr(code, message))
}

// ErrorWithData is identical to Error except that it attaches a structured
// payload (e.g. the current server snapshot in a save conflict) so the
// frontend can recover without an extra round trip.
func ErrorWithData(c *gin.Context, code uint32, message string, data any) {
	c.AbortWithStatusJSON(http.StatusOK, CommonResponse{
		Code:    code,
		Message: message,
		Data:    data,
	})
}
