package handler

import (
	stderrors "errors"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/xxxsen/common/logutil"
	"go.uber.org/zap"

	"github.com/xxxsen/mnote/internal/pkg/errcode"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/response"
)

type OAuthHandler struct {
	oauth IOAuthService
}

func NewOAuthHandler(oauth IOAuthService) *OAuthHandler {
	return &OAuthHandler{oauth: oauth}
}

func (h *OAuthHandler) AuthURL(c *gin.Context) {
	provider := strings.ToLower(c.Param("provider"))
	state, err := h.oauth.CreateState(c.Request.Context(), provider, "login", "", "/docs")
	if err != nil {
		handleError(c, err)
		return
	}
	authURL, err := h.oauth.GetAuthURL(provider, state)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"url": authURL})
}

func (h *OAuthHandler) BindURL(c *gin.Context) {
	provider := strings.ToLower(c.Param("provider"))
	returnTo := c.Query("return")
	state, err := h.oauth.CreateState(
		c.Request.Context(), provider, "bind", getUserID(c), returnTo,
	)
	if err != nil {
		handleError(c, err)
		return
	}
	authURL, err := h.oauth.GetAuthURL(provider, state)
	if err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"url": authURL})
}

func (h *OAuthHandler) Callback(c *gin.Context) {
	code := c.Query("code")
	state := c.Query("state")
	if code == "" || state == "" {
		h.redirectAuthError(c, "invalid", "")
		return
	}
	stored, err := h.oauth.ConsumeState(c.Request.Context(), state)
	if err != nil {
		h.redirectAuthError(c, "invalid", "")
		return
	}
	if stored.Provider != strings.ToLower(c.Param("provider")) {
		h.redirectAuthError(c, "invalid", stored.Provider)
		return
	}
	profile, err := h.oauth.ExchangeCode(c.Request.Context(), stored.Provider, code)
	if err != nil {
		h.redirectAuthError(c, mapOAuthError(err), stored.Provider)
		return
	}
	if stored.Purpose == "bind" {
		if err := h.oauth.Bind(c.Request.Context(), stored.UserID, profile); err != nil {
			h.redirectBindResult(c, stored.ReturnTo, mapOAuthError(err), stored.Provider)
			return
		}
		h.redirectBindResult(c, stored.ReturnTo, "bound", stored.Provider)
		return
	}
	user, _, err := h.oauth.LoginOrCreate(c.Request.Context(), profile)
	if err != nil {
		h.redirectAuthError(c, mapOAuthError(err), stored.Provider)
		return
	}
	exchangeCode, err := h.oauth.CreateExchange(c.Request.Context(), user)
	if err != nil {
		logutil.GetLogger(c.Request.Context()).Error("failed to issue oauth exchange code",
			zap.String("provider", stored.Provider),
			zap.String("user_id", user.ID),
		)
		h.redirectAuthError(c, "internal", stored.Provider)
		return
	}
	logutil.GetLogger(c.Request.Context()).Info("oauth exchange code issued",
		zap.String("provider", stored.Provider),
		zap.String("user_id", user.ID),
	)
	redirect := "/oauth/callback?code=" + url.QueryEscape(exchangeCode)
	c.Redirect(http.StatusFound, redirect)
}

type oauthExchangeRequest struct {
	Code string `json:"code"`
}

func (h *OAuthHandler) Exchange(c *gin.Context) {
	var req oauthExchangeRequest
	if err := bindJSON(c, &req); err != nil || strings.TrimSpace(req.Code) == "" {
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	item, err := h.oauth.ConsumeExchange(c.Request.Context(), req.Code)
	if err != nil {
		logutil.GetLogger(c.Request.Context()).Warn("oauth exchange rejected",
			zap.String("ip", c.ClientIP()),
			zap.Int("code_len", len(req.Code)),
		)
		response.Error(c, errcode.ErrInvalid, "invalid request")
		return
	}
	logutil.GetLogger(c.Request.Context()).Info("oauth exchange succeeded",
		zap.String("ip", c.ClientIP()),
	)
	response.Success(c, gin.H{"token": item.Token, "email": item.Email})
}

func (h *OAuthHandler) ListBindings(c *gin.Context) {
	bindings, err := h.oauth.ListBindings(c.Request.Context(), getUserID(c))
	if err != nil {
		handleError(c, err)
		return
	}
	items := make([]gin.H, 0, len(bindings))
	for _, item := range bindings {
		items = append(items, gin.H{
			"provider": item.Provider,
			"email":    item.Email,
		})
	}
	response.Success(c, gin.H{"bindings": items})
}

func (h *OAuthHandler) Unbind(c *gin.Context) {
	provider := strings.ToLower(c.Param("provider"))
	if err := h.oauth.Unbind(c.Request.Context(), getUserID(c), provider); err != nil {
		handleError(c, err)
		return
	}
	response.Success(c, gin.H{"ok": true})
}

func (h *OAuthHandler) redirectAuthError(c *gin.Context, code, provider string) {
	redirect := "/oauth/callback?error=" + url.QueryEscape(code)
	if provider != "" {
		redirect += "&provider=" + url.QueryEscape(provider)
	}
	c.Redirect(http.StatusFound, redirect)
}

func (h *OAuthHandler) redirectBindResult(c *gin.Context, returnTo, status, provider string) {
	if returnTo == "" || !strings.HasPrefix(returnTo, "/") || strings.HasPrefix(returnTo, "//") {
		returnTo = "/settings"
	}
	params := url.Values{}
	params.Set("oauth", status)
	if provider != "" {
		params.Set("provider", provider)
	}
	redirect := returnTo
	if strings.Contains(returnTo, "?") {
		redirect += "&" + params.Encode()
	} else {
		redirect += "?" + params.Encode()
	}
	c.Redirect(http.StatusFound, redirect)
}

func mapOAuthError(err error) string {
	if err == nil {
		return "internal"
	}
	switch {
	case stderrors.Is(err, appErr.ErrConflict):
		return "conflict"
	case stderrors.Is(err, appErr.ErrInvalid):
		return "invalid"
	case stderrors.Is(err, appErr.ErrNotFound):
		return "not_found"
	default:
		return "internal"
	}
}
