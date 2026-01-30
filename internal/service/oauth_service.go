package service

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/xxxsen/mnote/internal/config"
	"github.com/xxxsen/mnote/internal/model"
	appErr "github.com/xxxsen/mnote/internal/pkg/errors"
	"github.com/xxxsen/mnote/internal/pkg/jwt"
	"github.com/xxxsen/mnote/internal/pkg/timeutil"
	"github.com/xxxsen/mnote/internal/repo"
)

type OAuthProfile struct {
	Provider       string
	ProviderUserID string
	Email          string
}

type OAuthService struct {
	users      *repo.UserRepo
	oauths     *repo.OAuthRepo
	jwtSecret  []byte
	jwtTTL     time.Duration
	cfg        config.OAuthConfig
	properties config.Properties
	client     *http.Client
}

func NewOAuthService(users *repo.UserRepo, oauths *repo.OAuthRepo, secret []byte, ttl time.Duration, cfg config.OAuthConfig, properties config.Properties) *OAuthService {
	return &OAuthService{
		users:      users,
		oauths:     oauths,
		jwtSecret:  secret,
		jwtTTL:     ttl,
		cfg:        cfg,
		properties: properties,
		client:     &http.Client{Timeout: 10 * time.Second},
	}
}

func (s *OAuthService) GetAuthURL(provider, state string) (string, error) {
	cfg, err := s.providerConfig(provider)
	if err != nil {
		return "", err
	}
	if !s.providerEnabled(provider) {
		return "", appErr.ErrInvalid
	}
	if cfg.ClientID == "" || cfg.ClientSecret == "" || cfg.RedirectURL == "" {
		return "", appErr.ErrInvalid
	}
	params := url.Values{}
	params.Set("client_id", cfg.ClientID)
	params.Set("redirect_uri", cfg.RedirectURL)
	params.Set("scope", strings.Join(cfg.Scopes, " "))
	params.Set("state", state)
	if provider == "google" {
		params.Set("response_type", "code")
		return "https://accounts.google.com/o/oauth2/v2/auth?" + params.Encode(), nil
	}
	return "https://github.com/login/oauth/authorize?" + params.Encode(), nil
}

func (s *OAuthService) ExchangeCode(ctx context.Context, provider, code string) (*OAuthProfile, error) {
	cfg, err := s.providerConfig(provider)
	if err != nil {
		return nil, err
	}
	if !s.providerEnabled(provider) {
		return nil, appErr.ErrInvalid
	}
	if cfg.ClientID == "" || cfg.ClientSecret == "" || cfg.RedirectURL == "" {
		return nil, appErr.ErrInvalid
	}
	if provider == "google" {
		return s.exchangeGoogle(ctx, cfg, code)
	}
	return s.exchangeGithub(ctx, cfg, code)
}

func (s *OAuthService) LoginOrCreate(ctx context.Context, profile *OAuthProfile) (*model.User, string, error) {
	if profile == nil || profile.ProviderUserID == "" || profile.Email == "" || profile.Provider == "" {
		return nil, "", appErr.ErrInvalid
	}
	if account, err := s.oauths.GetByProviderUserID(ctx, profile.Provider, profile.ProviderUserID); err == nil {
		user, err := s.users.GetByID(ctx, account.UserID)
		if err != nil {
			return nil, "", err
		}
		token, err := jwt.GenerateToken(user.ID, s.jwtSecret, s.jwtTTL)
		if err != nil {
			return nil, "", err
		}
		return user, token, nil
	} else if err != appErr.ErrNotFound {
		return nil, "", err
	}
	if _, err := s.users.GetByEmail(ctx, profile.Email); err == nil {
		return nil, "", appErr.ErrConflict
	} else if err != appErr.ErrNotFound {
		return nil, "", err
	}
	now := timeutil.NowUnix()
	user := &model.User{
		ID:           newID(),
		Email:        profile.Email,
		PasswordHash: "",
		Ctime:        now,
		Mtime:        now,
	}
	if err := s.users.Create(ctx, user); err != nil {
		return nil, "", err
	}
	account := &model.OAuthAccount{
		ID:             newID(),
		UserID:         user.ID,
		Provider:       profile.Provider,
		ProviderUserID: profile.ProviderUserID,
		Email:          profile.Email,
		Ctime:          now,
		Mtime:          now,
	}
	if err := s.oauths.Create(ctx, account); err != nil {
		return nil, "", err
	}
	token, err := jwt.GenerateToken(user.ID, s.jwtSecret, s.jwtTTL)
	if err != nil {
		return nil, "", err
	}
	return user, token, nil
}

func (s *OAuthService) Bind(ctx context.Context, userID string, profile *OAuthProfile) error {
	if profile == nil || profile.ProviderUserID == "" || profile.Email == "" || profile.Provider == "" {
		return appErr.ErrInvalid
	}
	if account, err := s.oauths.GetByProviderUserID(ctx, profile.Provider, profile.ProviderUserID); err == nil {
		if account.UserID != userID {
			return appErr.ErrConflict
		}
		return nil
	} else if err != appErr.ErrNotFound {
		return err
	}
	if existing, err := s.oauths.GetByUserProvider(ctx, userID, profile.Provider); err == nil {
		if existing.ProviderUserID != profile.ProviderUserID {
			return appErr.ErrConflict
		}
		return nil
	} else if err != appErr.ErrNotFound {
		return err
	}
	now := timeutil.NowUnix()
	account := &model.OAuthAccount{
		ID:             newID(),
		UserID:         userID,
		Provider:       profile.Provider,
		ProviderUserID: profile.ProviderUserID,
		Email:          profile.Email,
		Ctime:          now,
		Mtime:          now,
	}
	return s.oauths.Create(ctx, account)
}

func (s *OAuthService) ListBindings(ctx context.Context, userID string) ([]model.OAuthAccount, error) {
	return s.oauths.ListByUser(ctx, userID)
}

func (s *OAuthService) Unbind(ctx context.Context, userID, provider string) error {
	count, err := s.oauths.CountByUser(ctx, userID)
	if err != nil {
		return err
	}
	if count <= 1 {
		user, err := s.users.GetByID(ctx, userID)
		if err != nil {
			return err
		}
		if strings.TrimSpace(user.PasswordHash) == "" {
			return appErr.ErrConflict
		}
	}
	return s.oauths.DeleteByUserProvider(ctx, userID, provider)
}

func (s *OAuthService) exchangeGithub(ctx context.Context, cfg config.OAuthProviderConfig, code string) (*OAuthProfile, error) {
	form := url.Values{}
	form.Set("client_id", cfg.ClientID)
	form.Set("client_secret", cfg.ClientSecret)
	form.Set("code", code)
	form.Set("redirect_uri", cfg.RedirectURL)
	accessToken, err := s.githubToken(ctx, form)
	if err != nil {
		return nil, err
	}
	user, err := s.githubUser(ctx, accessToken)
	if err != nil {
		return nil, err
	}
	email := strings.TrimSpace(user.Email)
	if email == "" {
		email, err = s.githubPrimaryEmail(ctx, accessToken)
		if err != nil {
			return nil, err
		}
	}
	if email == "" {
		return nil, appErr.ErrInvalid
	}
	return &OAuthProfile{Provider: "github", ProviderUserID: fmt.Sprint(user.ID), Email: email}, nil
}

func (s *OAuthService) exchangeGoogle(ctx context.Context, cfg config.OAuthProviderConfig, code string) (*OAuthProfile, error) {
	form := url.Values{}
	form.Set("code", code)
	form.Set("client_id", cfg.ClientID)
	form.Set("client_secret", cfg.ClientSecret)
	form.Set("redirect_uri", cfg.RedirectURL)
	form.Set("grant_type", "authorization_code")
	accessToken, err := s.googleToken(ctx, form)
	if err != nil {
		return nil, err
	}
	user, err := s.googleUser(ctx, accessToken)
	if err != nil {
		return nil, err
	}
	email := strings.TrimSpace(user.Email)
	if user.Sub == "" || email == "" {
		return nil, appErr.ErrInvalid
	}
	return &OAuthProfile{Provider: "google", ProviderUserID: user.Sub, Email: email}, nil
}

type githubTokenResponse struct {
	AccessToken string `json:"access_token"`
}

func (s *OAuthService) githubToken(ctx context.Context, form url.Values) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://github.com/login/oauth/access_token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := s.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
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

func (s *OAuthService) githubUser(ctx context.Context, accessToken string) (*githubUserResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
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

func (s *OAuthService) githubPrimaryEmail(ctx context.Context, accessToken string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user/emails", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := s.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
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

type googleTokenResponse struct {
	AccessToken string `json:"access_token"`
}

func (s *OAuthService) googleToken(ctx context.Context, form url.Values) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://oauth2.googleapis.com/token", strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := s.client.Do(req)
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

func (s *OAuthService) googleUser(ctx context.Context, accessToken string) (*googleUserResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://openidconnect.googleapis.com/v1/userinfo", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := s.client.Do(req)
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

func (s *OAuthService) providerConfig(provider string) (config.OAuthProviderConfig, error) {
	switch provider {
	case "github":
		return s.cfg.Github, nil
	case "google":
		return s.cfg.Google, nil
	default:
		return config.OAuthProviderConfig{}, appErr.ErrInvalid
	}
}

func (s *OAuthService) providerEnabled(provider string) bool {
	switch provider {
	case "github":
		return s.properties.EnableGithubOauth
	case "google":
		return s.properties.EnableGoogleOauth
	default:
		return false
	}
}
