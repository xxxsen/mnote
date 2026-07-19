package handler

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/xxxsen/mnote/internal/model"
	"github.com/xxxsen/mnote/internal/oauth"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/service"
)

func newOAuthHandler(mock *mockOAuthService) *OAuthHandler {
	return NewOAuthHandler(mock)
}

func TestOAuthHandlerAuthURL(t *testing.T) {
	mock := &mockOAuthService{
		createStateFn: func(_ context.Context, provider, purpose, userID, returnTo string) (string, error) {
			assert.Equal(t, "github", provider)
			assert.Equal(t, "login", purpose)
			assert.Empty(t, userID)
			assert.Equal(t, "/docs", returnTo)
			return "state-1", nil
		},
		getAuthURLFn: func(provider, state string) (string, error) {
			assert.Equal(t, "github", provider)
			assert.Equal(t, "state-1", state)
			return "https://github.example/authorize?state=" + state, nil
		},
	}
	handler := newOAuthHandler(mock)
	router := newTestRouter()
	router.GET("/auth/oauth/:provider/url", handler.AuthURL)

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest("GET", "/auth/oauth/github/url", nil))

	require.Equal(t, http.StatusOK, recorder.Code)
	data := parseResponseT(t, recorder)["data"].(map[string]any)
	assert.Contains(t, data["url"], "state-1")
}

func TestOAuthHandlerBindURL(t *testing.T) {
	mock := &mockOAuthService{
		createStateFn: func(_ context.Context, provider, purpose, userID, returnTo string) (string, error) {
			assert.Equal(t, "bind", purpose)
			assert.Equal(t, "u1", userID)
			assert.Equal(t, "/settings", returnTo)
			return "state-bind", nil
		},
		getAuthURLFn: func(_, state string) (string, error) {
			return "https://example.test?state=" + state, nil
		},
	}
	handler := newOAuthHandler(mock)
	router := newTestRouter()
	router.GET("/auth/oauth/:provider/bind/url", withUserID("u1"), handler.BindURL)

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(
		"GET", "/auth/oauth/github/bind/url?return=/settings", nil,
	))
	assert.Equal(t, http.StatusOK, recorder.Code)
}

func TestOAuthHandlerCallbackLoginUsesPersistentTokens(t *testing.T) {
	mock := &mockOAuthService{
		consumeStateFn: func(_ context.Context, raw string) (*service.OAuthState, error) {
			assert.Equal(t, "state-1", raw)
			return &service.OAuthState{Provider: "github", Purpose: "login"}, nil
		},
		exchangeCodeFn: func(_ context.Context, provider, code string) (*oauth.Profile, error) {
			assert.Equal(t, "github", provider)
			assert.Equal(t, "provider-code", code)
			return &oauth.Profile{
				Provider: "github", ProviderUserID: "gh-1", Email: "user@example.com",
			}, nil
		},
		loginOrCreateFn: func(_ context.Context, _ *oauth.Profile) (*model.User, string, error) {
			return &model.User{ID: "u1", Email: "user@example.com"}, "", nil
		},
		createExchangeFn: func(_ context.Context, user *model.User) (string, error) {
			assert.Equal(t, "u1", user.ID)
			return "exchange-1", nil
		},
	}
	handler := newOAuthHandler(mock)
	router := newTestRouter()
	router.GET("/auth/oauth/:provider/callback", handler.Callback)

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(
		"GET", "/auth/oauth/github/callback?code=provider-code&state=state-1", nil,
	))

	assert.Equal(t, http.StatusFound, recorder.Code)
	assert.Equal(t, "/oauth/callback?code=exchange-1", recorder.Header().Get("Location"))
}

func TestOAuthHandlerCallbackBindAndSafeRedirect(t *testing.T) {
	mock := &mockOAuthService{
		consumeStateFn: func(context.Context, string) (*service.OAuthState, error) {
			return &service.OAuthState{
				Provider: "github", Purpose: "bind", UserID: "u1",
				ReturnTo: "//evil.example",
			}, nil
		},
		exchangeCodeFn: func(context.Context, string, string) (*oauth.Profile, error) {
			return &oauth.Profile{
				Provider: "github", ProviderUserID: "gh-1", Email: "user@example.com",
			}, nil
		},
		bindFn: func(_ context.Context, userID string, _ *oauth.Profile) error {
			assert.Equal(t, "u1", userID)
			return nil
		},
	}
	handler := newOAuthHandler(mock)
	router := newTestRouter()
	router.GET("/auth/oauth/:provider/callback", handler.Callback)

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(
		"GET", "/auth/oauth/github/callback?code=provider-code&state=state-1", nil,
	))

	assert.Equal(t, http.StatusFound, recorder.Code)
	assert.Contains(t, recorder.Header().Get("Location"), "/settings?")
	assert.Contains(t, recorder.Header().Get("Location"), "oauth=bound")
}

func TestOAuthHandlerCallbackRejectsInvalidStateAndProviderMismatch(t *testing.T) {
	tests := []struct {
		name    string
		consume func(context.Context, string) (*service.OAuthState, error)
	}{
		{
			name: "invalid",
			consume: func(context.Context, string) (*service.OAuthState, error) {
				return nil, appErr.ErrInvalid
			},
		},
		{
			name: "provider mismatch",
			consume: func(context.Context, string) (*service.OAuthState, error) {
				return &service.OAuthState{Provider: "google", Purpose: "login"}, nil
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			handler := newOAuthHandler(&mockOAuthService{consumeStateFn: test.consume})
			router := newTestRouter()
			router.GET("/auth/oauth/:provider/callback", handler.Callback)
			recorder := httptest.NewRecorder()
			router.ServeHTTP(recorder, httptest.NewRequest(
				"GET", "/auth/oauth/github/callback?code=x&state=y", nil,
			))
			assert.Equal(t, http.StatusFound, recorder.Code)
			assert.Contains(t, recorder.Header().Get("Location"), "error=invalid")
		})
	}
}

func TestOAuthHandlerExchange(t *testing.T) {
	mock := &mockOAuthService{
		consumeExchangeFn: func(_ context.Context, code string) (*service.OAuthExchange, error) {
			assert.Equal(t, "exchange-1", code)
			return &service.OAuthExchange{Token: "jwt", Email: "user@example.com"}, nil
		},
	}
	handler := newOAuthHandler(mock)
	router := newTestRouter()
	router.POST("/auth/oauth/exchange", handler.Exchange)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, jsonRequestT(
		t, "POST", "/auth/oauth/exchange", oauthExchangeRequest{Code: "exchange-1"},
	))
	require.Equal(t, http.StatusOK, recorder.Code)
	data := parseResponseT(t, recorder)["data"].(map[string]any)
	assert.Equal(t, "jwt", data["token"])
	assert.Equal(t, "user@example.com", data["email"])
}

func TestOAuthHandlerBindings(t *testing.T) {
	mock := &mockOAuthService{
		listBindingsFn: func(context.Context, string) ([]model.OAuthAccount, error) {
			return []model.OAuthAccount{{Provider: "github", Email: "u@example.com"}}, nil
		},
		unbindFn: func(context.Context, string, string) error { return nil },
	}
	handler := newOAuthHandler(mock)
	router := newTestRouter()
	router.GET("/bindings", withUserID("u1"), handler.ListBindings)
	router.DELETE("/bindings/:provider", withUserID("u1"), handler.Unbind)

	listRecorder := httptest.NewRecorder()
	router.ServeHTTP(listRecorder, httptest.NewRequest("GET", "/bindings", nil))
	assert.Equal(t, http.StatusOK, listRecorder.Code)

	deleteRecorder := httptest.NewRecorder()
	router.ServeHTTP(deleteRecorder, httptest.NewRequest("DELETE", "/bindings/github", nil))
	assert.Equal(t, http.StatusOK, deleteRecorder.Code)
}

func TestOAuthHandlerErrors(t *testing.T) {
	handler := newOAuthHandler(&mockOAuthService{
		createStateFn: func(context.Context, string, string, string, string) (string, error) {
			return "", errors.New("db unavailable")
		},
	})
	router := newTestRouter()
	router.GET("/auth/oauth/:provider/url", handler.AuthURL)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest("GET", "/auth/oauth/github/url", nil))
	assert.NotEqual(t, float64(0), parseResponseT(t, recorder)["code"])

	assert.Equal(t, "conflict", mapOAuthError(appErr.ErrConflict))
	assert.Equal(t, "invalid", mapOAuthError(appErr.ErrInvalid))
	assert.Equal(t, "not_found", mapOAuthError(appErr.ErrNotFound))
	assert.Equal(t, "internal", mapOAuthError(errors.New("unknown")))
}
