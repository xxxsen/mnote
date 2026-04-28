package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
)

type googleProvider struct {
	cfg    ProviderArgs
	client *http.Client
}

func (g *googleProvider) Name() string {
	return "google"
}

func (g *googleProvider) AuthURL(state string) (string, error) {
	if g.cfg.Config.ClientID == "" || g.cfg.Config.RedirectURL == "" {
		return "", appErr.ErrInvalid
	}
	params := url.Values{}
	params.Set("client_id", g.cfg.Config.ClientID)
	params.Set("redirect_uri", g.cfg.Config.RedirectURL)
	params.Set("scope", strings.Join(g.cfg.Config.Scopes, " "))
	params.Set("state", state)
	params.Set("response_type", "code")
	return "https://accounts.google.com/o/oauth2/v2/auth?" + params.Encode(), nil
}

func (g *googleProvider) ExchangeCode(ctx context.Context, code string) (*Profile, error) {
	if g.cfg.Config.ClientID == "" || g.cfg.Config.ClientSecret == "" || g.cfg.Config.RedirectURL == "" {
		return nil, appErr.ErrInvalid
	}
	form := url.Values{}
	form.Set("code", code)
	form.Set("client_id", g.cfg.Config.ClientID)
	form.Set("client_secret", g.cfg.Config.ClientSecret)
	form.Set("redirect_uri", g.cfg.Config.RedirectURL)
	form.Set("grant_type", "authorization_code")
	accessToken, err := g.token(ctx, form)
	if err != nil {
		return nil, fmt.Errorf("exchange token: %w", err)
	}
	user, err := g.user(ctx, accessToken)
	if err != nil {
		return nil, fmt.Errorf("fetch userinfo: %w", err)
	}
	email := strings.TrimSpace(user.Email)
	if user.Sub == "" || email == "" {
		return nil, appErr.ErrInvalid
	}
	return &Profile{Provider: "google", ProviderUserID: user.Sub, Email: email}, nil
}

type googleTokenResponse struct {
	AccessToken string `json:"access_token"`
}

func (g *googleProvider) token(ctx context.Context, form url.Values) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://oauth2.googleapis.com/token",
		strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := g.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("create request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("%w: token exchange: %s: %s", ErrRequestFailed, resp.Status, strings.TrimSpace(string(body)))
	}
	var out googleTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", fmt.Errorf("decode: %w", err)
	}
	if out.AccessToken == "" {
		return "", appErr.ErrInvalid
	}
	return out.AccessToken, nil
}

type googleUserResponse struct {
	Sub   string `json:"sub"`
	Email string `json:"email"`
}

func (g *googleProvider) user(ctx context.Context, accessToken string) (*googleUserResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://openidconnect.googleapis.com/v1/userinfo", nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := g.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("%w: userinfo: %s: %s", ErrRequestFailed, resp.Status, strings.TrimSpace(string(body)))
	}
	var out googleUserResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	return &out, nil
}

func newGoogleProvider(args any) (Provider, error) {
	cfg := decodeProviderArgs(args)
	client := cfg.Client
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	return &googleProvider{cfg: cfg, client: client}, nil
}

func init() {
	Register("google", newGoogleProvider)
}
