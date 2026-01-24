package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"mnote/internal/pkg/response"
	"mnote/internal/service"
)

type AuthHandler struct {
	auth *service.AuthService
}

func NewAuthHandler(auth *service.AuthService) *AuthHandler {
	return &AuthHandler{auth: auth}
}

type authRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req authRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid", "invalid request")
		return
	}
	req.Email = strings.TrimSpace(req.Email)
	if req.Email == "" || req.Password == "" {
		response.Error(c, http.StatusBadRequest, "invalid", "invalid request")
		return
	}
	user, token, err := h.auth.Register(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"user": user, "token": token})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req authRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Error(c, http.StatusBadRequest, "invalid", "invalid request")
		return
	}
	req.Email = strings.TrimSpace(req.Email)
	if req.Email == "" || req.Password == "" {
		response.Error(c, http.StatusBadRequest, "invalid", "invalid request")
		return
	}
	user, token, err := h.auth.Login(c.Request.Context(), req.Email, req.Password)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"user": user, "token": token})
}

func (h *AuthHandler) Logout(c *gin.Context) {
	response.Success(c, gin.H{"ok": true})
}
