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
		return nil, err
	}
	user, err := g.user(ctx, accessToken)
	if err != nil {
		return nil, err
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
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://oauth2.googleapis.com/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := g.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("google token exchange failed: %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}
	var out googleTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
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
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := g.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("google userinfo failed: %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}
	var out googleUserResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return &out, nil
}

func newGoogleProvider(args interface{}) (Provider, error) {
	cfg, err := decodeProviderArgs(args)
	if err != nil {
		return nil, err
	}
	client := cfg.Client
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	return &googleProvider{cfg: cfg, client: client}, nil
}

func init() {
	Register("google", newGoogleProvider)
}
