package handler

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/response"
	"github.com/xxxsen/mnote/internal/service"
)

type OAuthHandler struct {
	oauth      *service.OAuthService
	stateStore *oauthStateStore
}

func NewOAuthHandler(oauth *service.OAuthService) *OAuthHandler {
	return &OAuthHandler{oauth: oauth, stateStore: newOAuthStateStore()}
}

func (h *OAuthHandler) AuthURL(c *gin.Context) {
	provider := strings.ToLower(c.Param("provider"))
	state := h.stateStore.Create(provider, "login", "", "/docs")
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
	state := h.stateStore.Create(provider, "bind", getUserID(c), returnTo)
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
	stored, ok := h.stateStore.Consume(state)
	if !ok {
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
	if stored.Mode == "bind" {
		if err := h.oauth.Bind(c.Request.Context(), stored.UserID, profile); err != nil {
			h.redirectBindResult(c, stored.ReturnTo, mapOAuthError(err), stored.Provider)
			return
		}
		h.redirectBindResult(c, stored.ReturnTo, "bound", stored.Provider)
		return
	}
	user, token, err := h.oauth.LoginOrCreate(c.Request.Context(), profile)
	if err != nil {
		h.redirectAuthError(c, mapOAuthError(err), stored.Provider)
		return
	}
	redirect := "/oauth/callback?token=" + url.QueryEscape(token) + "&email=" + url.QueryEscape(user.Email) + "&provider=" + url.QueryEscape(stored.Provider)
	c.Redirect(http.StatusFound, redirect)
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
	switch err {
	case appErr.ErrConflict:
		return "conflict"
	case appErr.ErrInvalid:
		return "invalid"
	case appErr.ErrNotFound:
		return "not_found"
	default:
		return "internal"
	}
}

type oauthState struct {
	Provider  string
	Mode      string
	UserID    string
	ReturnTo  string
	ExpiresAt time.Time
}

type oauthStateStore struct {
	mu    sync.Mutex
	items map[string]oauthState
}

func newOAuthStateStore() *oauthStateStore {
	return &oauthStateStore{items: make(map[string]oauthState)}
}

func (s *oauthStateStore) Create(provider, mode, userID, returnTo string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cleanupLocked()
	state := randomState()
	s.items[state] = oauthState{
		Provider:  provider,
		Mode:      mode,
		UserID:    userID,
		ReturnTo:  returnTo,
		ExpiresAt: time.Now().Add(10 * time.Minute),
	}
	return state
}

func (s *oauthStateStore) Consume(state string) (oauthState, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cleanupLocked()
	item, ok := s.items[state]
	if !ok {
		return oauthState{}, false
	}
	delete(s.items, state)
	if time.Now().After(item.ExpiresAt) {
		return oauthState{}, false
	}
	return item, true
}

func (s *oauthStateStore) cleanupLocked() {
	if len(s.items) == 0 {
		return
	}
	now := time.Now()
	for key, item := range s.items {
		if now.After(item.ExpiresAt) {
			delete(s.items, key)
		}
	}
}

func randomState() string {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return ""
	}
	return hex.EncodeToString(buf)
}
