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

type githubProvider struct {
	cfg    ProviderArgs
	client *http.Client
}

func (g *githubProvider) Name() string {
	return "github"
}

func (g *githubProvider) AuthURL(state string) (string, error) {
	if g.cfg.Config.ClientID == "" || g.cfg.Config.RedirectURL == "" {
		return "", appErr.ErrInvalid
	}
	params := url.Values{}
	params.Set("client_id", g.cfg.Config.ClientID)
	params.Set("redirect_uri", g.cfg.Config.RedirectURL)
	params.Set("scope", strings.Join(g.cfg.Config.Scopes, " "))
	params.Set("state", state)
	return "https://github.com/login/oauth/authorize?" + params.Encode(), nil
}

func (g *githubProvider) ExchangeCode(ctx context.Context, code string) (*Profile, error) {
	if g.cfg.Config.ClientID == "" || g.cfg.Config.ClientSecret == "" || g.cfg.Config.RedirectURL == "" {
		return nil, appErr.ErrInvalid
	}
	form := url.Values{}
	form.Set("client_id", g.cfg.Config.ClientID)
	form.Set("client_secret", g.cfg.Config.ClientSecret)
	form.Set("code", code)
	form.Set("redirect_uri", g.cfg.Config.RedirectURL)
	accessToken, err := g.token(ctx, form)
	if err != nil {
		return nil, err
	}
	user, err := g.user(ctx, accessToken)
	if err != nil {
		return nil, err
	}
	email := strings.TrimSpace(user.Email)
	if email == "" {
		email, err = g.primaryEmail(ctx, accessToken)
		if err != nil {
			return nil, err
		}
	}
	if email == "" {
		return nil, appErr.ErrInvalid
	}
	return &Profile{Provider: "github", ProviderUserID: fmt.Sprint(user.ID), Email: email}, nil
}

type githubTokenResponse struct {
	AccessToken string `json:"access_token"`
}

func (g *githubProvider) token(ctx context.Context, form url.Values) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://github.com/login/oauth/access_token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := g.client.Do(req)
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("github token exchange failed: %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}
	var out githubTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	if out.AccessToken == "" {
		return "", appErr.ErrInvalid
	}
	return out.AccessToken, nil
}

type githubUserResponse struct {
	ID    int64  `json:"id"`
	Email string `json:"email"`
}

func (g *githubProvider) user(ctx context.Context, accessToken string) (*githubUserResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := g.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("github user request failed: %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}
	var out githubUserResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	return &out, nil
}

type githubEmailResponse struct {
	Email    string `json:"email"`
	Primary  bool   `json:"primary"`
	Verified bool   `json:"verified"`
}

func (g *githubProvider) primaryEmail(ctx context.Context, accessToken string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user/emails", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := g.client.Do(req)
	if err != nil {
		return "", err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("github emails request failed: %s: %s", resp.Status, strings.TrimSpace(string(body)))
	}
	var emails []githubEmailResponse
	if err := json.NewDecoder(resp.Body).Decode(&emails); err != nil {
		return "", err
	}
	for _, item := range emails {
		if item.Primary && item.Verified {
			return item.Email, nil
		}
	}
	for _, item := range emails {
		if item.Verified {
			return item.Email, nil
		}
	}
	if len(emails) > 0 {
		return emails[0].Email, nil
	}
	return "", nil
}

func newGithubProvider(args interface{}) (Provider, error) {
	cfg, err := decodeProviderArgs(args)
	if err != nil {
		return nil, err
	}
	client := cfg.Client
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	return &githubProvider{cfg: cfg, client: client}, nil
}

func init() {
	Register("github", newGithubProvider)
}
