package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/oauth"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

func newOAuthHandler(mock *mockOAuthService) *OAuthHandler {
	return &OAuthHandler{
		oauth:      mock,
		stateStore: newOAuthStateStore(),
		exchange:   newOAuthExchangeStore(),
	}
}

func TestOAuthHandler_AuthURL_Success(t *testing.T) {
	mock := &mockOAuthService{
		getAuthURLFn: func(provider, state string) (string, error) {
			assert.Equal(t, "github", provider)
			assert.NotEmpty(t, state)
			return "https://github.com/login?state=" + state, nil
		},
	}
	h := newOAuthHandler(mock)
	r := newTestRouter()
	r.GET("/auth/oauth/:provider/url", h.AuthURL)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/auth/oauth/github/url", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	resp := parseResponseT(t, w)
	data := resp["data"].(map[string]any)
	assert.Contains(t, data["url"], "https://github.com/login")
}

func TestOAuthHandler_AuthURL_Error(t *testing.T) {
	mock := &mockOAuthService{
		getAuthURLFn: func(_, _ string) (string, error) {
			return "", errors.New("provider not configured")
		},
	}
	h := newOAuthHandler(mock)
	r := newTestRouter()
	r.GET("/auth/oauth/:provider/url", h.AuthURL)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/auth/oauth/unknown/url", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestOAuthHandler_BindURL_Success(t *testing.T) {
	mock := &mockOAuthService{
		getAuthURLFn: func(_, state string) (string, error) {
			return "https://github.com/login?state=" + state, nil
		},
	}
	h := newOAuthHandler(mock)
	r := newTestRouter()
	r.GET("/auth/oauth/:provider/bind/url", withUserID("u1"), h.BindURL)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/auth/oauth/github/bind/url?return=/settings", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestOAuthHandler_Exchange_Success(t *testing.T) {
	mock := &mockOAuthService{}
	h := newOAuthHandler(mock)
	code := h.exchange.Create("jwt-token", "user@example.com")
	require.NotEmpty(t, code)

	r := newTestRouter()
	r.POST("/auth/oauth/exchange", h.Exchange)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/auth/oauth/exchange", oauthExchangeRequest{Code: code})
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	resp := parseResponseT(t, w)
	data := resp["data"].(map[string]any)
	assert.Equal(t, "jwt-token", data["token"])
	assert.Equal(t, "user@example.com", data["email"])
}

func TestOAuthHandler_Exchange_InvalidCode(t *testing.T) {
	mock := &mockOAuthService{}
	h := newOAuthHandler(mock)
	r := newTestRouter()
	r.POST("/auth/oauth/exchange", h.Exchange)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/auth/oauth/exchange", oauthExchangeRequest{Code: "invalid"})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestOAuthHandler_Exchange_EmptyCode(t *testing.T) {
	mock := &mockOAuthService{}
	h := newOAuthHandler(mock)
	r := newTestRouter()
	r.POST("/auth/oauth/exchange", h.Exchange)

	w := httptest.NewRecorder()
	req := jsonRequestT(t, "POST", "/auth/oauth/exchange", oauthExchangeRequest{Code: ""})
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestOAuthHandler_ListBindings_Success(t *testing.T) {
	mock := &mockOAuthService{
		listBindingsFn: func(_ context.Context, _ string) ([]model.OAuthAccount, error) {
			return []model.OAuthAccount{
				{Provider: "github", Email: "user@github.com"},
			}, nil
		},
	}
	h := newOAuthHandler(mock)
	r := newTestRouter()
	r.GET("/auth/oauth/bindings", withUserID("u1"), h.ListBindings)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/auth/oauth/bindings", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestOAuthHandler_Unbind_Success(t *testing.T) {
	mock := &mockOAuthService{
		unbindFn: func(_ context.Context, _, provider string) error {
			assert.Equal(t, "github", provider)
			return nil
		},
	}
	h := newOAuthHandler(mock)
	r := newTestRouter()
	r.DELETE("/auth/oauth/:provider/bind", withUserID("u1"), h.Unbind)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/auth/oauth/github/bind", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestOAuthHandler_Unbind_Error(t *testing.T) {
	mock := &mockOAuthService{
		unbindFn: func(_ context.Context, _, _ string) error { return errors.New("last binding") },
	}
	h := newOAuthHandler(mock)
	r := newTestRouter()
	r.DELETE("/auth/oauth/:provider/bind", withUserID("u1"), h.Unbind)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("DELETE", "/auth/oauth/github/bind", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestOAuthHandler_Callback_MissingParams(t *testing.T) {
	mock := &mockOAuthService{}
	h := newOAuthHandler(mock)
	r := newTestRouter()
	r.GET("/auth/oauth/:provider/callback", h.Callback)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/auth/oauth/github/callback", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusFound, w.Code)
	assert.Contains(t, w.Header().Get("Location"), "error=invalid")
}

func TestOAuthHandler_Callback_InvalidState(t *testing.T) {
	mock := &mockOAuthService{}
	h := newOAuthHandler(mock)
	r := newTestRouter()
	r.GET("/auth/oauth/:provider/callback", h.Callback)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/auth/oauth/github/callback?code=abc&state=bad", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusFound, w.Code)
	assert.Contains(t, w.Header().Get("Location"), "error=invalid")
}

func TestOAuthHandler_Callback_LoginSuccess(t *testing.T) {
	mock := &mockOAuthService{
		exchangeCodeFn: func(_ context.Context, _, _ string) (*oauth.Profile, error) {
			return &oauth.Profile{
				Provider: "github", ProviderUserID: "gh123", Email: "user@gh.com",
			}, nil
		},
		loginOrCreateFn: func(_ context.Context, _ *oauth.Profile) (*model.User, string, error) {
			return &model.User{ID: "u1", Email: "user@gh.com"}, "jwt-token", nil
		},
	}
	h := newOAuthHandler(mock)
	state := h.stateStore.Create("github", "login", "", "/docs")

	r := newTestRouter()
	r.GET("/auth/oauth/:provider/callback", h.Callback)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/auth/oauth/github/callback?code=authcode&state="+state, nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusFound, w.Code)
	assert.Contains(t, w.Header().Get("Location"), "/oauth/callback?code=")
}

func TestOAuthHandler_Callback_BindSuccess(t *testing.T) {
	mock := &mockOAuthService{
		exchangeCodeFn: func(_ context.Context, _, _ string) (*oauth.Profile, error) {
			return &oauth.Profile{
				Provider: "github", ProviderUserID: "gh123", Email: "user@gh.com",
			}, nil
		},
		bindFn: func(_ context.Context, _ string, _ *oauth.Profile) error { return nil },
	}
	h := newOAuthHandler(mock)
	state := h.stateStore.Create("github", "bind", "u1", "/settings")

	r := newTestRouter()
	r.GET("/auth/oauth/:provider/callback", h.Callback)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/auth/oauth/github/callback?code=authcode&state="+state, nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusFound, w.Code)
	assert.Contains(t, w.Header().Get("Location"), "oauth=bound")
}

func TestOAuthHandler_Callback_ProviderMismatch(t *testing.T) {
	mock := &mockOAuthService{}
	h := newOAuthHandler(mock)
	state := h.stateStore.Create("github", "login", "", "/docs")

	r := newTestRouter()
	r.GET("/auth/oauth/:provider/callback", h.Callback)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/auth/oauth/google/callback?code=abc&state="+state, nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusFound, w.Code)
	assert.Contains(t, w.Header().Get("Location"), "error=invalid")
}

func TestOAuthHandler_BindURL_Error(t *testing.T) {
	mock := &mockOAuthService{
		getAuthURLFn: func(_, _ string) (string, error) {
			return "", errors.New("provider error")
		},
	}
	h := newOAuthHandler(mock)
	r := newTestRouter()
	r.GET("/auth/oauth/:provider/bind/url", withUserID("u1"), h.BindURL)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/auth/oauth/github/bind/url", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestOAuthHandler_Callback_ExchangeError(t *testing.T) {
	mock := &mockOAuthService{
		exchangeCodeFn: func(_ context.Context, _, _ string) (*oauth.Profile, error) {
			return nil, errors.New("exchange failed")
		},
	}
	h := newOAuthHandler(mock)
	state := h.stateStore.Create("github", "login", "", "/docs")

	r := newTestRouter()
	r.GET("/auth/oauth/:provider/callback", h.Callback)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/auth/oauth/github/callback?code=bad&state="+state, nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusFound, w.Code)
	assert.Contains(t, w.Header().Get("Location"), "error=internal")
}

func TestOAuthHandler_Callback_BindError(t *testing.T) {
	mock := &mockOAuthService{
		exchangeCodeFn: func(_ context.Context, _, _ string) (*oauth.Profile, error) {
			return &oauth.Profile{Provider: "github"}, nil
		},
		bindFn: func(_ context.Context, _ string, _ *oauth.Profile) error {
			return errors.New("bind failed")
		},
	}
	h := newOAuthHandler(mock)
	state := h.stateStore.Create("github", "bind", "u1", "/settings")

	r := newTestRouter()
	r.GET("/auth/oauth/:provider/callback", h.Callback)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/auth/oauth/github/callback?code=abc&state="+state, nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusFound, w.Code)
	assert.Contains(t, w.Header().Get("Location"), "oauth=internal")
}

func TestOAuthHandler_Callback_LoginError(t *testing.T) {
	mock := &mockOAuthService{
		exchangeCodeFn: func(_ context.Context, _, _ string) (*oauth.Profile, error) {
			return &oauth.Profile{Provider: "github"}, nil
		},
		loginOrCreateFn: func(_ context.Context, _ *oauth.Profile) (*model.User, string, error) {
			return nil, "", errors.New("login failed")
		},
	}
	h := newOAuthHandler(mock)
	state := h.stateStore.Create("github", "login", "", "/docs")

	r := newTestRouter()
	r.GET("/auth/oauth/:provider/callback", h.Callback)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/auth/oauth/github/callback?code=abc&state="+state, nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusFound, w.Code)
	assert.Contains(t, w.Header().Get("Location"), "error=internal")
}

func TestOAuthHandler_ListBindings_Error(t *testing.T) {
	mock := &mockOAuthService{
		listBindingsFn: func(_ context.Context, _ string) ([]model.OAuthAccount, error) {
			return nil, errors.New("bindings error")
		},
	}
	h := newOAuthHandler(mock)
	r := newTestRouter()
	r.GET("/auth/oauth/bindings", withUserID("u1"), h.ListBindings)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/auth/oauth/bindings", nil)
	r.ServeHTTP(w, req)

	resp := parseResponseT(t, w)
	assert.NotEqual(t, float64(0), resp["code"])
}

func TestOAuthHandler_ListBindings_Empty(t *testing.T) {
	mock := &mockOAuthService{
		listBindingsFn: func(_ context.Context, _ string) ([]model.OAuthAccount, error) {
			return []model.OAuthAccount{}, nil
		},
	}
	h := newOAuthHandler(mock)
	r := newTestRouter()
	r.GET("/auth/oauth/bindings", withUserID("u1"), h.ListBindings)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/auth/oauth/bindings", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestOAuthHandler_MapOAuthError(t *testing.T) {
	assert.Equal(t, "internal", mapOAuthError(nil))
	assert.Equal(t, "internal", mapOAuthError(errors.New("unknown")))
	assert.Equal(t, "conflict", mapOAuthError(appErr.ErrConflict))
	assert.Equal(t, "invalid", mapOAuthError(appErr.ErrInvalid))
	assert.Equal(t, "not_found", mapOAuthError(appErr.ErrNotFound))
}

func TestOAuthHandler_RedirectBindResult_WithQueryString(t *testing.T) {
	mock := &mockOAuthService{
		exchangeCodeFn: func(_ context.Context, _, _ string) (*oauth.Profile, error) {
			return &oauth.Profile{Provider: "github"}, nil
		},
		bindFn: func(_ context.Context, _ string, _ *oauth.Profile) error { return nil },
	}
	h := newOAuthHandler(mock)
	state := h.stateStore.Create("github", "bind", "u1", "/settings?tab=security")

	r := newTestRouter()
	r.GET("/auth/oauth/:provider/callback", h.Callback)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/auth/oauth/github/callback?code=abc&state="+state, nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusFound, w.Code)
	loc := w.Header().Get("Location")
	assert.Contains(t, loc, "/settings?tab=security&")
	assert.Contains(t, loc, "oauth=bound")
}

func TestOAuthHandler_RedirectBindResult_UnsafeReturn(t *testing.T) {
	mock := &mockOAuthService{
		exchangeCodeFn: func(_ context.Context, _, _ string) (*oauth.Profile, error) {
			return &oauth.Profile{Provider: "github"}, nil
		},
		bindFn: func(_ context.Context, _ string, _ *oauth.Profile) error { return nil },
	}
	h := newOAuthHandler(mock)
	state := h.stateStore.Create("github", "bind", "u1", "//evil.com")

	r := newTestRouter()
	r.GET("/auth/oauth/:provider/callback", h.Callback)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/auth/oauth/github/callback?code=abc&state="+state, nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusFound, w.Code)
	assert.Contains(t, w.Header().Get("Location"), "/settings")
}

func TestOAuthStateStore_ExpiredState(t *testing.T) {
	store := newOAuthStateStore()
	store.mu.Lock()
	store.items["expired"] = oauthState{
		Provider:  "github",
		Mode:      "login",
		ExpiresAt: time.Now().Add(-1 * time.Minute),
	}
	store.mu.Unlock()

	_, ok := store.Consume("expired")
	assert.False(t, ok)
}

func TestOAuthExchangeStore_ExpiredCode(t *testing.T) {
	store := newOAuthExchangeStore()
	store.mu.Lock()
	store.items["expired"] = oauthExchangeItem{
		Token:     "tok",
		Email:     "e@e.com",
		ExpiresAt: time.Now().Add(-1 * time.Minute),
	}
	store.mu.Unlock()

	_, ok := store.Consume("expired")
	assert.False(t, ok)
}

func TestOAuthStateStore_CleanupExpired(t *testing.T) {
	store := newOAuthStateStore()
	store.mu.Lock()
	store.items["old"] = oauthState{ExpiresAt: time.Now().Add(-1 * time.Hour)}
	store.mu.Unlock()

	_ = store.Create("github", "login", "", "/")
	store.mu.Lock()
	_, exists := store.items["old"]
	store.mu.Unlock()
	assert.False(t, exists)
}

func TestOAuthExchangeStore_CleanupExpired(t *testing.T) {
	store := newOAuthExchangeStore()
	store.mu.Lock()
	store.items["old"] = oauthExchangeItem{ExpiresAt: time.Now().Add(-1 * time.Hour)}
	store.mu.Unlock()

	_ = store.Create("tok", "email")
	store.mu.Lock()
	_, exists := store.items["old"]
	store.mu.Unlock()
	assert.False(t, exists)
}

func TestOAuthHandler_RedirectBindResult_DefaultReturn(t *testing.T) {
	mock := &mockOAuthService{
		exchangeCodeFn: func(_ context.Context, _, _ string) (*oauth.Profile, error) {
			return &oauth.Profile{
				Provider: "github", ProviderUserID: "gh123", Email: "user@gh.com",
			}, nil
		},
		bindFn: func(_ context.Context, _ string, _ *oauth.Profile) error { return nil },
	}
	h := newOAuthHandler(mock)
	state := h.stateStore.Create("github", "bind", "u1", "")

	r := newTestRouter()
	r.GET("/auth/oauth/:provider/callback", h.Callback)

	w := httptest.NewRecorder()
	req := httptest.NewRequest("GET", "/auth/oauth/github/callback?code=abc&state="+state, nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusFound, w.Code)
	loc := w.Header().Get("Location")
	assert.Contains(t, loc, "/settings")
}
